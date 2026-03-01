import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { broadcast } from "../broadcast.js";
import { getRequestUser } from "./auth.js";

// ── Role hierarchy ─────────────────────────────────────────────────────────────
type ProjectRole = "owner" | "admin" | "member";
const ROLE_RANK: Record<ProjectRole, number> = { owner: 3, admin: 2, member: 1 };

export async function registerProjects(server: FastifyInstance, db: pg.Pool) {

  // ── Access helper ──────────────────────────────────────────────────────────
  // Resolves project by id/slug AND checks caller's role in one shot.
  // Returns { projectId, role } on success, or { deny: 404|403 } on failure.
  // API-key / unauthenticated callers (no cookie) are treated as owner-level
  // so agent workflows continue to work unimpeded.
  async function checkAccess(
    idOrSlug: string,
    req: unknown,
    minRole: ProjectRole = "member"
  ): Promise<{ projectId: string; role: ProjectRole } | { deny: 404 | 403 }> {
    const { rows } = await db.query(
      `select id, owner_user_id, org_id from projects where id::text = $1 or lower(slug) = lower($1)`,
      [idOrSlug]
    );
    if (!rows[0]) return { deny: 404 };

    const userId = getRequestUser(req)?.userId ?? null;
    // No cookie = API-key request → full owner-level access
    if (!userId) return { projectId: rows[0].id, role: "owner" };

    let role: ProjectRole;
    if (rows[0].owner_user_id === userId) {
      // 1. Project owner
      role = "owner";
    } else {
      // 2. Direct project invite (project_user_members)
      const { rows: pr } = await db.query(
        `select role from project_user_members where project_id = $1 and user_id = $2`,
        [rows[0].id, userId]
      );
      if (pr[0]) {
        role = pr[0].role as ProjectRole;
      } else if (rows[0].org_id) {
        // 3. Org membership — user belongs to the org that owns this project
        const { rows: or } = await db.query(
          `select role from org_user_members where org_id = $1 and user_id = $2`,
          [rows[0].org_id, userId]
        );
        if (!or[0]) return { deny: 403 };
        role = or[0].role as ProjectRole;
      } else {
        return { deny: 403 };
      }
    }

    if (ROLE_RANK[role] < ROLE_RANK[minRole]) return { deny: 403 };
    return { projectId: rows[0].id, role };
  }

  // ── List all projects ──────────────────────────────────────────────────────
  server.get("/api/v1/projects", async (req) => {
    const userId = getRequestUser(req)?.userId ?? null;
    const { rows: projects } = await db.query(
      `select p.*,
              count(distinct pt.agent_id)::int as team_size,
              max(t.updated_at) as last_activity,
              case
                when $1::uuid is null     then null
                when p.owner_user_id = $1 then 'owner'
                when exists (
                  select 1 from org_user_members oum
                  where oum.org_id = p.org_id and oum.user_id = $1::uuid
                )                         then (
                  select oum.role from org_user_members oum
                  where oum.org_id = p.org_id and oum.user_id = $1::uuid
                  limit 1
                )
                else                           'member'
              end as my_role
       from projects p
       left join project_team pt on pt.project_id = p.id
       left join tasks t on t.project_id = p.id
       where p.status != 'archived'
         and (
           $1::uuid is null
           or p.owner_user_id = $1::uuid
           or exists (
             select 1 from project_user_members pum
             where pum.project_id = p.id and pum.user_id = $1::uuid
           )
           or exists (
             select 1 from org_user_members oum
             where oum.org_id = p.org_id and oum.user_id = $1::uuid
           )
         )
       group by p.id
       order by p.created_at asc`,
      [userId]
    );
    return { ok: true, projects };
  });

  // ── Get single project ─────────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      const { rows } = await db.query(
        `select p.*,
                count(distinct pt.agent_id)::int as team_size,
                max(t.updated_at) as last_activity
         from projects p
         left join project_team pt on pt.project_id = p.id
         left join tasks t on t.project_id = p.id
         where p.id = $1
         group by p.id`,
        [access.projectId]
      );
      return { ok: true, project: { ...rows[0], my_role: access.role } };
    }
  );

  // ── Create project ─────────────────────────────────────────────────────────
  server.post<{ Body: { slug: string; name: string; description?: string; status?: string } }>(
    "/api/v1/projects",
    async (req, reply) => {
      const { slug, name, description = "", status = "active" } = req.body;
      if (!slug || !name) return reply.status(400).send({ ok: false, error: "slug and name required" });
      const userId = getRequestUser(req)?.userId ?? null;
      const { rows } = await db.query(
        `insert into projects (slug, name, description, status, owner_user_id)
         values ($1, $2, $3, $4, $5) returning *`,
        [slug, name, description, status, userId]
      );
      return reply.status(201).send({ ok: true, project: rows[0] });
    }
  );

  // ── Update project — admin+ ────────────────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/v1/projects/:id",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const allowed = ["name", "description", "status", "progress"];
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

  // ── Get architecture doc — member+ ─────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/architecture",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      const { rows } = await db.query(
        `select architecture_doc as content from projects where id = $1`,
        [access.projectId]
      );
      return { ok: true, content: rows[0]?.content ?? null };
    }
  );

  // ── Update architecture doc — admin+ ──────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: { content: string } }>(
    "/api/v1/projects/:id/architecture",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      await db.query(
        `update projects set architecture_doc = $1, updated_at = now() where id = $2`,
        [req.body.content, access.projectId]
      );
      return { ok: true };
    }
  );

  // ── Get tech spec doc — member+ ────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/tech-spec",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      const { rows } = await db.query(
        `select tech_spec_doc as content from projects where id = $1`,
        [access.projectId]
      );
      return { ok: true, content: rows[0]?.content ?? null };
    }
  );

  // ── Update tech spec doc — admin+ ─────────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: { content: string } }>(
    "/api/v1/projects/:id/tech-spec",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      await db.query(
        `update projects set tech_spec_doc = $1, updated_at = now() where id = $2`,
        [req.body.content, access.projectId]
      );
      return { ok: true };
    }
  );

  // ── List tasks — member+ ───────────────────────────────────────────────────
  server.get<{ Params: { id: string }; Querystring: { status?: string; assignee?: string } }>(
    "/api/v1/projects/:id/tasks",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const conditions = ["project_id = $1"];
      const vals: unknown[] = [access.projectId];
      if (req.query.status) {
        vals.push(req.query.status);
        conditions.push(`status = $${vals.length}`);
      }
      if (req.query.assignee) {
        vals.push(req.query.assignee);
        conditions.push(`lower(assignee) = lower($${vals.length})`);
      }
      const { rows } = await db.query(
        `select * from tasks where ${conditions.join(" and ")} order by created_at asc`,
        vals
      );
      return { ok: true, tasks: rows };
    }
  );

  // ── Helper: write task_assigned to agent inbox ─────────────────────────────
  async function notifyAgentInbox(agentName: string, task: Record<string, unknown>) {
    if (!agentName) return;
    const { rows: agents } = await db.query(
      `select id from agents where name ILIKE $1 limit 1`,
      [agentName]
    );
    if (!agents[0]) return;
    await db.query(
      `insert into agent_inbox (agent_id, type, payload) values ($1, 'task_assigned', $2)`,
      [
        agents[0].id,
        JSON.stringify({
          task_id:     task.id,
          project_id:  task.project_id,
          title:       task.title,
          description: task.description,
          priority:    task.priority,
          status:      task.status,
          due_date:    task.due_date ?? null,
          assigned_to: agentName,
        }),
      ]
    );
  }

  // ── Create task — member+ ──────────────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { title: string; description?: string; proposer?: string; assignee?: string; status?: string; priority?: string; type?: string; estimated_sp?: number; due_date?: string } }>(
    "/api/v1/projects/:id/tasks",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { title, description = "", assignee, status = "proposed", priority = "medium", type = "Task", due_date } = req.body;
      if (!title) return reply.status(400).send({ ok: false, error: "title required" });

      const authUser    = getRequestUser(req);
      const requestorName = authUser?.name ?? req.body.proposer ?? null;
      const actorName   = authUser?.name ?? "System";
      let requestorOrg: string | null = null;
      if (authUser?.userId) {
        const orgRes = await db.query(
          `select name from organisations where owner_user_id = $1 order by created_at limit 1`,
          [authUser.userId]
        );
        requestorOrg = orgRes.rows[0]?.name ?? null;
      }

      const { rows } = await db.query(
        `insert into tasks (project_id, title, description, proposer, requestor_org, assignee, status, priority, type, due_date)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
        [access.projectId, title, description, requestorName, requestorOrg, assignee ?? null, status, priority, type, due_date ?? null]
      );
      broadcast("task:created", { task: rows[0] });

      // Write 'created' activity
      const actorType = authUser ? "human" : "system";
      await db.query(
        `insert into task_activity (task_id, project_id, actor_name, actor_type, action, to_value)
         values ($1, $2, $3, $4, 'created', $5)`,
        [rows[0].id, access.projectId, actorName, actorType, status]
      );

      if (assignee) await notifyAgentInbox(assignee, rows[0]);
      return reply.status(201).send({ ok: true, task: rows[0] });
    }
  );

  // ── Delete task — admin+ ───────────────────────────────────────────────────
  server.delete<{ Params: { id: string; taskId: string } }>(
    "/api/v1/projects/:id/tasks/:taskId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { rowCount } = await db.query(
        `delete from tasks where id = $1 and project_id = $2 returning id`,
        [req.params.taskId, access.projectId]
      );
      if (!rowCount) return reply.status(404).send({ ok: false, error: "task not found" });
      await db.query(
        `delete from agent_inbox where type = 'task_assigned' and payload->>'task_id' = $1`,
        [req.params.taskId]
      );
      broadcast("task:deleted", { taskId: req.params.taskId });
      return { ok: true };
    }
  );

  // ── Update task — member+ ──────────────────────────────────────────────────
  server.patch<{ Params: { id: string; taskId: string }; Body: Record<string, unknown> }>(
    "/api/v1/projects/:id/tasks/:taskId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const allowed = ["title", "description", "status", "assignee", "proposer", "type", "estimated_sp", "priority", "due_date", "completion_note"];
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          vals.push(req.body[key]);
          sets.push(`${key} = $${vals.length}`);
        }
      }
      if (!sets.length) return reply.status(400).send({ ok: false, error: "nothing to update" });

      const { rows: before } = await db.query(
        `select status, assignee from tasks where id = $1 and project_id = $2`,
        [req.params.taskId, access.projectId]
      );
      if (!before[0]) return reply.status(404).send({ ok: false, error: "task not found" });
      const oldAssignee: string | null = before[0]?.assignee ?? null;
      const oldStatus: string          = before[0]?.status ?? "";

      vals.push(req.params.taskId);
      const { rows } = await db.query(
        `update tasks set ${sets.join(", ")}, updated_at = now() where id = $${vals.length} returning *`,
        vals
      );
      broadcast("task:updated", { task: rows[0] });

      // ── Write activity entries ──────────────────────────────────────────────
      const authUser   = getRequestUser(req);
      const actorName  = authUser?.name ?? "System";
      const actorType  = authUser ? "human" : "system";
      const activityOps: Promise<unknown>[] = [];

      const newStatus   = req.body.status   as string | undefined;
      const newAssignee = req.body.assignee as string | undefined;

      if (newStatus !== undefined && newStatus !== oldStatus) {
        activityOps.push(db.query(
          `insert into task_activity (task_id, project_id, actor_name, actor_type, action, from_value, to_value)
           values ($1, $2, $3, $4, 'status_changed', $5, $6)`,
          [req.params.taskId, access.projectId, actorName, actorType, oldStatus, newStatus]
        ));
      }
      if (newAssignee !== undefined && newAssignee !== oldAssignee) {
        activityOps.push(db.query(
          `insert into task_activity (task_id, project_id, actor_name, actor_type, action, from_value, to_value)
           values ($1, $2, $3, $4, 'assigned', $5, $6)`,
          [req.params.taskId, access.projectId, actorName, actorType, oldAssignee, newAssignee || null]
        ));
      }
      if (activityOps.length > 0) await Promise.all(activityOps);

      // ── Agent inbox notifications ───────────────────────────────────────────
      if (newAssignee !== undefined) {
        if (oldAssignee) {
          await db.query(
            `delete from agent_inbox
             where type = 'task_assigned'
               and payload->>'task_id' = $1
               and agent_id = (select id from agents where name ILIKE $2 limit 1)`,
            [req.params.taskId, oldAssignee]
          );
        }
        if (newAssignee) await notifyAgentInbox(newAssignee, rows[0]);
      }
      return { ok: true, task: rows[0] };
    }
  );

  // ── Get task activity — member+ ───────────────────────────────────────────
  server.get<{ Params: { id: string; taskId: string } }>(
    "/api/v1/projects/:id/tasks/:taskId/activity",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      const { rows } = await db.query(
        `select id, actor_name, actor_type, action, from_value, to_value, created_at
         from task_activity
         where task_id = $1
         order by created_at asc`,
        [req.params.taskId]
      );
      return { ok: true, activity: rows };
    }
  );

  // ── Get agent team — member+ ───────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/team",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      const { rows } = await db.query(
        `select pt.id, pt.role, pt.joined_at,
                a.id as agent_id, a.name, a.status, a.description,
                a.agent_type, a.model, a.provider, a.capabilities,
                a.ping_status, a.last_ping_ms, a.last_seen_at,
                o.name as org_name, o.slug as org_slug
         from project_team pt
         join agents a on a.id = pt.agent_id
         left join organisations o on o.id = a.org_id
         where pt.project_id = $1
         order by pt.joined_at asc`,
        [access.projectId]
      );
      return { ok: true, team: rows };
    }
  );

  // ── Add agent to team — admin+ ─────────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { agent_id: string; role?: string } }>(
    "/api/v1/projects/:id/team",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { agent_id, role = "Member" } = req.body;
      if (!agent_id) return reply.status(400).send({ ok: false, error: "agent_id required" });
      const { rows } = await db.query(
        `insert into project_team (project_id, agent_id, role)
         values ($1, $2, $3)
         on conflict (project_id, agent_id) do update set role = excluded.role
         returning *`,
        [access.projectId, agent_id, role]
      );
      return reply.status(201).send({ ok: true, member: rows[0] });
    }
  );

  // ── Remove agent from team — admin+ ───────────────────────────────────────
  server.delete<{ Params: { id: string; agentId: string } }>(
    "/api/v1/projects/:id/team/:agentId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      await db.query(
        `delete from project_team where project_id = $1 and agent_id = $2`,
        [access.projectId, req.params.agentId]
      );
      return { ok: true };
    }
  );

  // ── List user members — member+ ────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/user-members",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "member");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      const { rows } = await db.query(
        `select pum.id, pum.role, pum.joined_at,
                u.id as user_id, u.email, u.name, u.avatar_url,
                inv.name as invited_by_name
         from project_user_members pum
         join users u on u.id = pum.user_id
         left join users inv on inv.id = pum.invited_by
         where pum.project_id = $1
         order by pum.joined_at asc`,
        [access.projectId]
      );
      return { ok: true, members: rows };
    }
  );

  // ── Add user member by email — admin+ ─────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { email: string; role?: string } }>(
    "/api/v1/projects/:id/user-members",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { email, role = "member" } = req.body;
      if (!email) return reply.status(400).send({ ok: false, error: "email required" });

      const { rows: users } = await db.query(
        `select id, name, email from users where lower(email) = lower($1)`,
        [email.trim()]
      );
      if (!users[0]) return reply.status(404).send({ ok: false, error: "no user found with that email" });

      const invitedBy = getRequestUser(req)?.userId ?? null;
      const { rows } = await db.query(
        `insert into project_user_members (project_id, user_id, role, invited_by)
         values ($1, $2, $3, $4)
         on conflict (project_id, user_id) do update set role = excluded.role
         returning *`,
        [access.projectId, users[0].id, role, invitedBy]
      );
      return reply.status(201).send({ ok: true, member: { ...rows[0], user_id: users[0].id, email: users[0].email, name: users[0].name } });
    }
  );

  // ── Remove user member — admin+ ────────────────────────────────────────────
  server.delete<{ Params: { id: string; userId: string } }>(
    "/api/v1/projects/:id/user-members/:userId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      await db.query(
        `delete from project_user_members where project_id = $1 and user_id = $2`,
        [access.projectId, req.params.userId]
      );
      return { ok: true };
    }
  );

  // ── Generate invite — admin+ ───────────────────────────────────────────────
  const APP_BASE = process.env.APP_BASE_URL ?? "https://darshan.caringgems.in";

  server.post<{ Params: { id: string }; Body: { email?: string; role?: string } }>(
    "/api/v1/projects/:id/invites",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { email, role = "member" } = req.body ?? {};
      const invitedBy = getRequestUser(req)?.userId ?? null;

      const { rows } = await db.query(
        `insert into project_invites (project_id, role, invited_by, invitee_email)
         values ($1, $2, $3, $4) returning *`,
        [access.projectId, role, invitedBy, email?.trim().toLowerCase() ?? null]
      );
      return reply.status(201).send({
        ok: true,
        invite: { ...rows[0], invite_url: `${APP_BASE}/invite/project/${rows[0].token}` },
      });
    }
  );

  // ── List invites — admin+ ──────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/invites",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { rows } = await db.query(
        `select pi.*, u.name as invited_by_name, au.name as accepted_by_name
         from project_invites pi
         left join users u  on u.id  = pi.invited_by
         left join users au on au.id = pi.accepted_by
         where pi.project_id = $1
         order by pi.created_at desc`,
        [access.projectId]
      );
      return {
        ok: true,
        invites: rows.map((r) => ({ ...r, invite_url: `${APP_BASE}/invite/project/${r.token}` })),
      };
    }
  );

  // ── Revoke invite — admin+ ─────────────────────────────────────────────────
  server.delete<{ Params: { id: string; inviteId: string } }>(
    "/api/v1/projects/:id/invites/:inviteId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      await db.query(
        `delete from project_invites where id = $1 and project_id = $2`,
        [req.params.inviteId, access.projectId]
      );
      return { ok: true };
    }
  );
}
