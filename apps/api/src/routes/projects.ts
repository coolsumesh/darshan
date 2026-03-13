import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { pushToAgent } from "../broadcast.js";
import { getRequestUser } from "./auth.js";

type ProjectRole = "owner" | "admin" | "contributor" | "viewer";
const ROLE_RANK: Record<ProjectRole, number> = { owner: 4, admin: 3, contributor: 2, viewer: 1 };

export async function registerProjects(server: FastifyInstance, db: pg.Pool) {
  async function checkAccess(
    idOrSlug: string,
    req: unknown,
    minRole: ProjectRole = "viewer"
  ): Promise<{ projectId: string; role: ProjectRole } | { deny: 404 | 403 }> {
    const { rows } = await db.query(
      `select id, owner_user_id from projects where id::text = $1 or lower(slug) = lower($1)`,
      [idOrSlug]
    );
    if (!rows[0]) return { deny: 404 };

    const userId = getRequestUser(req)?.userId ?? null;
    const authHeader = (req as { headers?: Record<string, string | undefined> })?.headers?.authorization ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const internalApiKey = process.env.DARSHAN_API_KEY ?? "824cdfcdec0e35cf550002c2dfa3541932f58e2e2497cfaa3c844dc99f5b972f";

    if (bearer && bearer === internalApiKey) return { projectId: rows[0].id, role: "owner" };
    if (!userId) return { deny: 403 };

    let role: ProjectRole;
    if (rows[0].owner_user_id === userId) {
      role = "owner";
    } else {
      const { rows: memberships } = await db.query(
        `select role from project_users where project_id = $1 and user_id = $2`,
        [rows[0].id, userId]
      );
      if (!memberships[0]) return { deny: 403 };
      role = memberships[0].role as ProjectRole;
    }

    if (ROLE_RANK[role] < ROLE_RANK[minRole]) return { deny: 403 };
    return { projectId: rows[0].id, role };
  }

  server.get("/projects", async (req) => {
    const userId = getRequestUser(req)?.userId ?? null;
    const { rows: projects } = await db.query(
      `select p.*,
              count(distinct pt.agent_id)::int as team_size,
              greatest(
                p.updated_at,
                coalesce(max(tm.sent_at), max(th.created_at), p.updated_at)
              ) as last_activity,
              case
                when $1::uuid is null then null
                when p.owner_user_id = $1 then 'owner'
                else 'viewer'
              end as my_role
       from projects p
       left join project_agents pt on pt.project_id = p.id
       left join threads th on th.project_id = p.id and th.deleted_at is null
       left join thread_messages tm on tm.thread_id = th.thread_id
       where p.status != 'archived'
         and (
           $1::uuid is null
           or p.owner_user_id = $1::uuid
           or exists (
             select 1 from project_users pu
             where pu.project_id = p.id and pu.user_id = $1::uuid
           )
         )
       group by p.id
       order by p.created_at asc`,
      [userId]
    );
    return { ok: true, projects };
  });

  server.get<{ Params: { id: string } }>(
    "/projects/:id",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const { rows } = await db.query(
        `select p.*,
                count(distinct pt.agent_id)::int as team_size,
                greatest(
                  p.updated_at,
                  coalesce(max(tm.sent_at), max(th.created_at), p.updated_at)
                ) as last_activity
         from projects p
         left join project_agents pt on pt.project_id = p.id
         left join threads th on th.project_id = p.id and th.deleted_at is null
         left join thread_messages tm on tm.thread_id = th.thread_id
         where p.id = $1
         group by p.id`,
        [access.projectId]
      );
      return { ok: true, project: { ...rows[0], my_role: access.role } };
    }
  );

  server.post<{ Body: { slug: string; name: string; description?: string; status?: string; workspace_id?: string } }>(
    "/projects",
    async (req, reply) => {
      const { slug, name, description = "", status = "active", workspace_id } = req.body;
      if (!slug || !name) return reply.status(400).send({ ok: false, error: "slug and name required" });

      const userId = getRequestUser(req)?.userId ?? null;
      const { rows } = await db.query(
        `insert into projects (slug, name, description, status, owner_user_id, workspace_id)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [slug, name, description, status, userId, workspace_id ?? null]
      );
      return reply.status(201).send({ ok: true, project: rows[0] });
    }
  );

  server.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/projects/:id",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const allowed = ["name", "description", "status", "progress", "agent_briefing", "workspace_id"];
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          vals.push(req.body[key]);
          sets.push(`${key} = $${vals.length}`);
        }
      }
      if (!sets.length) return reply.status(400).send({ ok: false, error: "nothing to update" });

      vals.push(access.projectId);
      const { rows } = await db.query(
        `update projects set ${sets.join(", ")}, updated_at = now() where id = $${vals.length} returning *`,
        vals
      );
      return { ok: true, project: rows[0] };
    }
  );

  server.get<{ Params: { id: string } }>(
    "/projects/:id/architecture",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }
      const { rows } = await db.query(`select architecture_doc as content from projects where id = $1`, [access.projectId]);
      return { ok: true, content: rows[0]?.content ?? null };
    }
  );

  server.patch<{ Params: { id: string }; Body: { content: string } }>(
    "/projects/:id/architecture",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }
      await db.query(`update projects set architecture_doc = $1, updated_at = now() where id = $2`, [req.body.content, access.projectId]);
      return { ok: true };
    }
  );

  server.get<{ Params: { id: string } }>(
    "/projects/:id/tech-spec",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }
      const { rows } = await db.query(`select tech_spec_doc as content from projects where id = $1`, [access.projectId]);
      return { ok: true, content: rows[0]?.content ?? null };
    }
  );

  server.patch<{ Params: { id: string }; Body: { content: string } }>(
    "/projects/:id/tech-spec",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }
      await db.query(`update projects set tech_spec_doc = $1, updated_at = now() where id = $2`, [req.body.content, access.projectId]);
      return { ok: true };
    }
  );

  server.get<{
    Params: { id: string };
    Querystring: {
      status?: string;
      type?: string;
      task_status?: string;
      assignee_agent_id?: string;
      assignee_user_id?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    "/projects/:id/threads",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const conditions = ["t.project_id = $1", "t.deleted_at is null"];
      const vals: unknown[] = [access.projectId];
      const requestedStatus = req.query.status?.trim();
      const requestedType = req.query.type?.trim();
      const requestedTaskStatus = req.query.task_status?.trim();
      const requestedAssigneeAgentId = req.query.assignee_agent_id?.trim();
      const requestedAssigneeUserId = req.query.assignee_user_id?.trim();
      const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 200);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);

      if (requestedStatus && ["open", "closed", "archived"].includes(requestedStatus)) {
        vals.push(requestedStatus);
        conditions.push(`t.status = $${vals.length}`);
      }
      if (requestedType) {
        vals.push(requestedType);
        conditions.push(`t.thread_type = $${vals.length}`);
      }
      if (requestedTaskStatus) {
        vals.push(requestedTaskStatus);
        conditions.push(`t.task_status = $${vals.length}`);
      }
      if (requestedAssigneeAgentId) {
        vals.push(requestedAssigneeAgentId);
        conditions.push(`t.assignee_agent_id = $${vals.length}::uuid`);
      }
      if (requestedAssigneeUserId) {
        vals.push(requestedAssigneeUserId);
        conditions.push(`t.assignee_user_id = $${vals.length}::uuid`);
      }

      vals.push(limit);
      vals.push(offset);

      const { rows } = await db.query(
        `select
           t.*,
           coalesce(assignee_agent.name, assignee_user.name) as assignee_name,
           first_message.body as description,
           coalesce(last_message.sent_at, t.created_at) as last_activity
         from threads t
         left join agents assignee_agent on assignee_agent.id = t.assignee_agent_id
         left join users assignee_user on assignee_user.id = t.assignee_user_id
         left join lateral (
           select tm.body
           from thread_messages tm
           where tm.thread_id = t.thread_id
             and tm.type = 'message'
           order by tm.sent_at asc
           limit 1
         ) first_message on true
         left join lateral (
           select tm.sent_at
           from thread_messages tm
           where tm.thread_id = t.thread_id
           order by tm.sent_at desc
           limit 1
         ) last_message on true
         where ${conditions.join(" and ")}
         order by coalesce(last_message.sent_at, t.created_at) desc, t.created_at desc
         limit $${vals.length - 1}
         offset $${vals.length}`,
        vals
      );
      return { ok: true, threads: rows, limit, offset };
    }
  );

  server.get<{ Params: { id: string } }>(
    "/projects/:id/team",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }
      const { rows } = await db.query(
        `select pt.id, pt.joined_at,
                a.id as agent_id, a.name, a.status, a.description,
                a.agent_type, a.model, a.provider, a.capabilities,
                a.ping_status, a.last_ping_ms, a.last_seen_at,
                coalesce(par.agent_role, 'worker') as agent_role,
                coalesce(apl.current_level, 0) as agent_level,
                null::text as level_confidence,
                null::timestamptz as last_evaluated_at
         from project_agents pt
         join agents a on a.id = pt.agent_id
         left join project_agent_roles par
           on par.project_id = pt.project_id and par.agent_id = pt.agent_id
         left join agent_project_levels apl
           on apl.project_id = pt.project_id and apl.agent_id = pt.agent_id
         where pt.project_id = $1
         order by pt.joined_at asc`,
        [access.projectId]
      );
      return { ok: true, team: rows };
    }
  );

  server.post<{ Params: { id: string }; Body: { agent_id: string; role?: string } }>(
    "/projects/:id/team",
    async (req, reply) => {
      const userId = getRequestUser(req)?.userId ?? null;
      if (!userId) return reply.status(401).send({ ok: false, error: "authentication required" });

      const access = await checkAccess(req.params.id, req, "contributor");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const { agent_id } = req.body;
      if (!agent_id) return reply.status(400).send({ ok: false, error: "agent_id required" });

      const { rows: agents } = await db.query(`select id, owner_user_id from agents where id::text = $1`, [agent_id]);
      if (!agents[0]) return reply.status(404).send({ ok: false, error: "agent not found" });
      if (agents[0].owner_user_id !== userId) {
        return reply.status(403).send({ ok: false, error: "forbidden: you can only assign your own agents" });
      }

      const { rows } = await db.query(
        `insert into project_agents (project_id, agent_id, added_by)
         values ($1, $2, $3)
         on conflict (project_id, agent_id) do nothing
         returning *`,
        [access.projectId, agent_id, userId]
      );

      const requestedRole = typeof req.body.role === "string" ? req.body.role.toLowerCase() : null;
      const agentRole =
        requestedRole === "coordinator" || requestedRole === "worker" || requestedRole === "reviewer"
          ? requestedRole
          : "worker";

      await db.query(
        `insert into project_agent_roles (project_id, agent_id, agent_role, updated_by)
         values ($1, $2, $3, $4)
         on conflict (project_id, agent_id) do update
         set agent_role = excluded.agent_role,
             updated_by = excluded.updated_by,
             updated_at = now()`,
        [access.projectId, agent_id, agentRole, userId]
      );

      const { rows: projects } = await db.query(
        `select id, slug, name, description, agent_briefing from projects where id = $1`,
        [access.projectId]
      );
      if (projects[0]) {
        const project = projects[0];
        pushToAgent(agent_id, "project_onboarded", {
          project_id: project.id,
          project_slug: project.slug,
          project_name: project.name,
          description: project.description,
          agent_briefing: project.agent_briefing,
        });
      }

      return reply.status(201).send({ ok: true, member: rows[0] });
    }
  );

  server.delete<{ Params: { id: string; agentId: string } }>(
    "/projects/:id/team/:agentId",
    async (req, reply) => {
      const userId = getRequestUser(req)?.userId ?? null;
      if (!userId) return reply.status(401).send({ ok: false, error: "authentication required" });

      const access = await checkAccess(req.params.id, req, "contributor");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const { rows: agents } = await db.query(`select owner_user_id from agents where id::text = $1`, [req.params.agentId]);
      if (!agents[0]) return reply.status(404).send({ ok: false, error: "agent not found" });

      const canAdminProject = access.role === "owner" || access.role === "admin";
      const ownsAgent = agents[0].owner_user_id === userId;
      if (!canAdminProject && !ownsAgent) {
        return reply.status(403).send({ ok: false, error: "forbidden: you can only remove your own agents" });
      }

      await db.query(`delete from project_agents where project_id = $1 and agent_id = $2`, [access.projectId, req.params.agentId]);
      return { ok: true };
    }
  );

  server.get<{ Params: { id: string } }>(
    "/projects/:id/user-members",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const { rows } = await db.query(
        `with members as (
           select pu.id,
                  case when p.owner_user_id = pu.user_id then 'owner' else pu.role end as role,
                  pu.joined_at,
                  u.id as user_id, u.email, u.name, u.avatar_url,
                  inv.name as invited_by_name
           from project_users pu
           join users u on u.id = pu.user_id
           join projects p on p.id = pu.project_id
           left join users inv on inv.id = pu.invited_by
           where pu.project_id = $1

           union all

           select p.id as id,
                  'owner' as role,
                  p.created_at as joined_at,
                  u.id as user_id, u.email, u.name, u.avatar_url,
                  null::text as invited_by_name
           from projects p
           join users u on u.id = p.owner_user_id
           where p.id = $1
             and not exists (
               select 1 from project_users pu2
               where pu2.project_id = p.id and pu2.user_id = p.owner_user_id
             )
         )
         select * from members
         order by joined_at asc`,
        [access.projectId]
      );
      return { ok: true, members: rows };
    }
  );

  server.post<{ Params: { id: string }; Body: { email: string; role?: string } }>(
    "/projects/:id/user-members",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const { email, role = "contributor" } = req.body;
      if (!email) return reply.status(400).send({ ok: false, error: "email required" });
      const normalizedEmail = email.trim().toLowerCase();

      const { rows: existingMember } = await db.query(
        `select 1
         from project_users pu
         join users u on u.id = pu.user_id
         where pu.project_id = $1 and lower(u.email) = lower($2)
         limit 1`,
        [access.projectId, normalizedEmail]
      );
      if (existingMember[0]) {
        return reply.status(409).send({ ok: false, error: "user already a project member" });
      }

      const { rows: existingInvite } = await db.query(
        `select * from project_invites
         where project_id = $1
           and lower(invitee_email) = lower($2)
           and accepted_at is null
           and declined_at is null
           and expires_at > now()
         order by created_at desc
         limit 1`,
        [access.projectId, normalizedEmail]
      );
      if (existingInvite[0]) {
        return reply.status(200).send({
          ok: true,
          invite: { ...existingInvite[0], invite_url: `${appBase}/invite/project/${existingInvite[0].token}` },
        });
      }

      const invitedBy = getRequestUser(req)?.userId ?? null;
      const { rows } = await db.query(
        `insert into project_invites (project_id, role, invited_by, invitee_email)
         values ($1, $2, $3, $4)
         returning *`,
        [access.projectId, role, invitedBy, normalizedEmail]
      );
      return reply.status(201).send({
        ok: true,
        invite: { ...rows[0], invite_url: `${appBase}/invite/project/${rows[0].token}` },
      });
    }
  );

  server.delete<{ Params: { id: string; userId: string } }>(
    "/projects/:id/user-members/:userId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }
      await db.query(`delete from project_users where project_id = $1 and user_id = $2`, [access.projectId, req.params.userId]);
      return { ok: true };
    }
  );

  const appBase = process.env.APP_BASE_URL ?? "https://darshan.caringgems.in";

  server.post<{ Params: { id: string }; Body: { email?: string; role?: string } }>(
    "/projects/:id/invites",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const { email, role = "contributor" } = req.body ?? {};
      const invitedBy = getRequestUser(req)?.userId ?? null;
      const { rows } = await db.query(
        `insert into project_invites (project_id, role, invited_by, invitee_email)
         values ($1, $2, $3, $4) returning *`,
        [access.projectId, role, invitedBy, email?.trim().toLowerCase() ?? null]
      );
      return reply.status(201).send({
        ok: true,
        invite: { ...rows[0], invite_url: `${appBase}/invite/project/${rows[0].token}` },
      });
    }
  );

  server.get<{ Params: { id: string } }>(
    "/projects/:id/invites",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }

      const { rows } = await db.query(
        `select pi.*, u.name as invited_by_name, au.name as accepted_by_name
         from project_invites pi
         left join users u on u.id = pi.invited_by
         left join users au on au.id = pi.accepted_by
         where pi.project_id = $1
         order by pi.created_at desc`,
        [access.projectId]
      );
      return {
        ok: true,
        invites: rows.map((row) => ({ ...row, invite_url: `${appBase}/invite/project/${row.token}` })),
      };
    }
  );

  server.delete<{ Params: { id: string; inviteId: string } }>(
    "/projects/:id/invites/:inviteId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) {
        return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      }
      await db.query(`delete from project_invites where id = $1 and project_id = $2`, [req.params.inviteId, access.projectId]);
      return { ok: true };
    }
  );
}
