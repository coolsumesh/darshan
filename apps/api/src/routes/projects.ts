import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { broadcast, pushToAgent } from "../broadcast.js";
import { getRequestUser } from "./auth.js";

// ── Role hierarchy ─────────────────────────────────────────────────────────────
type ProjectRole = "owner" | "admin" | "contributor" | "viewer";
const ROLE_RANK: Record<ProjectRole, number> = { owner: 4, admin: 3, contributor: 2, viewer: 1 };

export async function registerProjects(server: FastifyInstance, db: pg.Pool) {

  // ── Access helper ──────────────────────────────────────────────────────────
  // Resolves project by id/slug AND checks caller's role in one shot.
  // Returns { projectId, role } on success, or { deny: 404|403 } on failure.
  // API-key / unauthenticated callers (no cookie) are treated as owner-level
  // so agent workflows continue to work unimpeded.
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
    const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "824cdfcdec0e35cf550002c2dfa3541932f58e2e2497cfaa3c844dc99f5b972f";

    // Internal API key retains owner-level access for system flows.
    if (bearer && bearer === INTERNAL_API_KEY) return { projectId: rows[0].id, role: "owner" };

    // No authenticated user and no valid internal key -> forbidden.
    if (!userId) return { deny: 403 };

    let role: ProjectRole;
    if (rows[0].owner_user_id === userId) {
      // 1. Project owner
      role = "owner";
    } else {
      // 2. Direct project invite (project_users)
      const { rows: pr } = await db.query(
        `select role from project_users where project_id = $1 and user_id = $2`,
        [rows[0].id, userId]
      );
      if (pr[0]) {
        role = pr[0].role as ProjectRole;
      } else {
        return { deny: 403 };
      }
    }

    if (ROLE_RANK[role] < ROLE_RANK[minRole]) return { deny: 403 };
    return { projectId: rows[0].id, role };
  }

  // ── List all projects ──────────────────────────────────────────────────────
  server.get("/projects", async (req) => {
    const userId = getRequestUser(req)?.userId ?? null;
    const { rows: projects } = await db.query(
      `select p.*,
              count(distinct pt.agent_id)::int as team_size,
              max(t.updated_at) as last_activity,
              case
                when $1::uuid is null     then null
                when p.owner_user_id = $1 then 'owner'
                else                           'viewer'
              end as my_role
       from projects p
       left join project_agents pt on pt.project_id = p.id
       left join tasks t on t.project_id = p.id
       where p.status != 'archived'
         and (
           $1::uuid is null
           or p.owner_user_id = $1::uuid
           or exists (
             select 1 from project_users pum
             where pum.project_id = p.id and pum.user_id = $1::uuid
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
    "/projects/:id",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      const { rows } = await db.query(
        `select p.*,
                count(distinct pt.agent_id)::int as team_size,
                max(t.updated_at) as last_activity
         from projects p
         left join project_agents pt on pt.project_id = p.id
         left join tasks t on t.project_id = p.id
         where p.id = $1
         group by p.id`,
        [access.projectId]
      );
      return { ok: true, project: { ...rows[0], my_role: access.role } };
    }
  );

  // ── Create project ─────────────────────────────────────────────────────────
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

  // ── Update project — admin+ ────────────────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/projects/:id",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

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

  // ── Get architecture doc — member+ ─────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/projects/:id/architecture",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
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
    "/projects/:id/architecture",
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
    "/projects/:id/tech-spec",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
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
    "/projects/:id/tech-spec",
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
    "/projects/:id/tasks",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
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

  // ── Helper: push task_assigned to agent via WS ────────────────────────────
  async function notifyAgentTaskAssigned(agentName: string, task: Record<string, unknown>) {
    if (!agentName) return;
    const { rows: agents } = await db.query(
      `select id from agents where name ILIKE $1 limit 1`,
      [agentName]
    );
    if (!agents[0]) return;

    const { rows: projects } = await db.query(
      `select slug, name, agent_briefing from projects where id = $1 limit 1`,
      [task.project_id]
    );
    const project = projects[0] ?? {};

    pushToAgent(agents[0].id, "task_assigned", {
      task_id:        task.id,
      project_id:     task.project_id,
      project_slug:   project.slug    ?? null,
      project_name:   project.name    ?? null,
      agent_briefing: project.agent_briefing ?? null,
      title:          task.title,
      description:    task.description,
      priority:       task.priority,
      status:         task.status,
      due_date:       task.due_date ?? null,
      assigned_to:    agentName,
    });
  }

  // ── Create task — member+ ──────────────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { title: string; description?: string; proposer?: string; assignee?: string; status?: string; priority?: string; type?: string; estimated_sp?: number; due_date?: string } }>(
    "/projects/:id/tasks",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { title, description = "", assignee, status = "proposed", priority = "medium", type = "Task", due_date } = req.body;
      if (!title) return reply.status(400).send({ ok: false, error: "title required" });

      const authUser    = getRequestUser(req);
      const requestorName = authUser?.name ?? req.body.proposer ?? null;
      const actorName   = authUser?.name ?? "System";
      const requestorOrg: string | null = null;

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

      if (assignee) await notifyAgentTaskAssigned(assignee, rows[0]);
      return reply.status(201).send({ ok: true, task: rows[0] });
    }
  );

  // ── Delete task — admin+ ───────────────────────────────────────────────────
  server.delete<{ Params: { id: string; taskId: string } }>(
    "/projects/:id/tasks/:taskId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { rowCount } = await db.query(
        `delete from tasks where id = $1 and project_id = $2 returning id`,
        [req.params.taskId, access.projectId]
      );
      if (!rowCount) return reply.status(404).send({ ok: false, error: "task not found" });
      broadcast("task:deleted", { taskId: req.params.taskId });
      return { ok: true };
    }
  );

  // ── Update task — member+ ──────────────────────────────────────────────────
  server.patch<{ Params: { id: string; taskId: string }; Body: Record<string, unknown> }>(
    "/projects/:id/tasks/:taskId",
    async (req, reply) => {
      const authUser = getRequestUser(req);
      const authHeader = req.headers.authorization ?? "";
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "824cdfcdec0e35cf550002c2dfa3541932f58e2e2497cfaa3c844dc99f5b972f";
      const isInternal = bearer === INTERNAL_API_KEY;

      let projectIdForUpdate: string;
      let actorName: string;
      let actorType: "human" | "system" | "agent" = "system";

      if (authUser || isInternal) {
        const access = await checkAccess(req.params.id, req, "viewer");
        if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
        projectIdForUpdate = access.projectId;
        actorName = authUser?.name ?? "System";
        actorType = authUser ? "human" : "system";
      } else {
        // Agent callback-token path (heartbeat/runtime)
        const { rows: taskRows } = await db.query(
          `select t.project_id, t.status, t.assignee, t.proposer, a.name as agent_name
           from tasks t
           join projects p on p.id = t.project_id
           join agents a on a.callback_token = $1
           where t.id = $2
             and (p.id::text = $3 or lower(p.slug) = lower($3))
           limit 1`,
          [bearer, req.params.taskId, req.params.id]
        );
        if (!taskRows[0]) return reply.status(401).send({ ok: false, error: "not authenticated" });

        // Agents can only update execution-related fields
        const allowedAgentFields = new Set(["status", "completion_note", "assignee"]);
        for (const key of Object.keys(req.body)) {
          if (!allowedAgentFields.has(key)) {
            return reply.status(403).send({ ok: false, error: "forbidden field for agent update" });
          }
        }

        const bodyKeys = Object.keys(req.body);
        const agentName = (taskRows[0].agent_name ?? "Agent") as string;
        const isAssignedToAgent =
          typeof taskRows[0].assignee === "string" &&
          taskRows[0].assignee.toLowerCase() === agentName.toLowerCase();
        let requestedAssignee = req.body.assignee as string | undefined;

        if (requestedAssignee !== undefined) {
          if (typeof requestedAssignee !== "string" || requestedAssignee.trim().length === 0) {
            return reply.status(400).send({ ok: false, error: "invalid assignee target" });
          }
          requestedAssignee = requestedAssignee.trim();
          req.body.assignee = requestedAssignee;
        }

        let hasTerminalHandoffByAgent = false;
        if (!isAssignedToAgent) {
          const { rows: handoffRows } = await db.query(
            `select 1
             from task_activity
             where task_id = $1
               and actor_type = 'agent'
               and lower(actor_name) = lower($2)
               and action = 'status_changed'
               and lower(coalesce(to_value, '')) in ('review', 'done')
             limit 1`,
            [req.params.taskId, agentName]
          );
          hasTerminalHandoffByAgent = !!handoffRows[0];
        }

        // Allow post-handoff completion-note finalization only for the same agent.
        const isCompletionNoteOnlyUpdate = bodyKeys.length > 0 && bodyKeys.every((k) => k === "completion_note");
        if (!isAssignedToAgent && !(hasTerminalHandoffByAgent && isCompletionNoteOnlyUpdate)) {
          return reply.status(401).send({ ok: false, error: "not authenticated" });
        }

        // If handing off away from the agent, constrain the transition and validate the target.
        if (
          isAssignedToAgent &&
          requestedAssignee !== undefined &&
          requestedAssignee.toLowerCase() !== agentName.toLowerCase()
        ) {
          const requestedStatus = req.body.status;
          if (requestedStatus !== "review" && requestedStatus !== "done") {
            return reply.status(403).send({ ok: false, error: "handoff requires terminal status transition" });
          }

          const nextAssignee = requestedAssignee;
          const { rows: validRows } = await db.query(
            `select 1
             from tasks t
             join projects p on p.id = t.project_id
             where t.id = $1
               and p.id = $2
               and (
                 lower(coalesce(t.proposer, '')) = lower($3)
                 or exists (
                   select 1
                   from users u
                   where u.id = p.owner_user_id
                     and lower(u.name) = lower($3)
                 )
                 or exists (
                   select 1
                   from project_users pu
                   join users u on u.id = pu.user_id
                   where pu.project_id = p.id
                     and lower(u.name) = lower($3)
                 )
                 or exists (
                   select 1
                   from project_agents pa
                   join agents a2 on a2.id = pa.agent_id
                   join project_agent_roles par
                     on par.project_id = pa.project_id
                    and par.agent_id = pa.agent_id
                   where pa.project_id = p.id
                     and par.agent_role = 'coordinator'
                     and lower(a2.name) = lower($3)
                 )
               )
             limit 1`,
            [req.params.taskId, taskRows[0].project_id, nextAssignee]
          );
          if (!validRows[0]) return reply.status(400).send({ ok: false, error: "invalid handoff assignee" });
        }

        projectIdForUpdate = taskRows[0].project_id;
        actorName = agentName;
        actorType = "agent";
      }

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
        [req.params.taskId, projectIdForUpdate]
      );
      if (!before[0]) return reply.status(404).send({ ok: false, error: "task not found" });
      const oldAssignee: string | null = before[0]?.assignee ?? null;
      const oldStatus: string          = before[0]?.status ?? "";

      vals.push(req.params.taskId);
      vals.push(projectIdForUpdate);
      const { rows } = await db.query(
        `update tasks
         set ${sets.join(", ")}, updated_at = now()
         where id = $${vals.length - 1}
           and project_id = $${vals.length}
         returning *`,
        vals
      );
      broadcast("task:updated", { task: rows[0] });

      // ── Write activity entries ──────────────────────────────────────────────
      const activityOps: Promise<unknown>[] = [];

      const newStatus   = req.body.status   as string | undefined;
      const newAssignee = req.body.assignee as string | undefined;

      if (newStatus !== undefined && newStatus !== oldStatus) {
        activityOps.push(db.query(
          `insert into task_activity (task_id, project_id, actor_name, actor_type, action, from_value, to_value)
           values ($1, $2, $3, $4, 'status_changed', $5, $6)`,
          [req.params.taskId, projectIdForUpdate, actorName, actorType, oldStatus, newStatus]
        ));
      }
      if (newAssignee !== undefined && newAssignee !== oldAssignee) {
        activityOps.push(db.query(
          `insert into task_activity (task_id, project_id, actor_name, actor_type, action, from_value, to_value)
           values ($1, $2, $3, $4, 'assigned', $5, $6)`,
          [req.params.taskId, projectIdForUpdate, actorName, actorType, oldAssignee, newAssignee || null]
        ));
      }
      if (activityOps.length > 0) await Promise.all(activityOps);

      // ── WS task notifications ──────────────────────────────────────────────
      let notifiedAssignee = false;
      if (newAssignee !== undefined) {
        if (newAssignee) {
          await notifyAgentTaskAssigned(newAssignee, rows[0]);
          notifiedAssignee = true;
        }
      }

      // Re-notify when task is moved to approved and has an assignee.
      // This makes task pickup resilient even when prior assignment events were missed.
      if (newStatus === "approved" && !notifiedAssignee && rows[0].assignee) {
        await notifyAgentTaskAssigned(rows[0].assignee as string, rows[0]);
      }

      return { ok: true, task: rows[0] };
    }
  );

  // ── Get task activity — member+ ───────────────────────────────────────────
  server.get<{ Params: { id: string; taskId: string } }>(
    "/projects/:id/tasks/:taskId/activity",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
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
    "/projects/:id/team",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
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

  // ── Add agent to team — admin+ ─────────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { agent_id: string; role?: string } }>(
    "/projects/:id/team",
    async (req, reply) => {
      const userId = getRequestUser(req)?.userId ?? null;
      if (!userId) return reply.status(401).send({ ok: false, error: "authentication required" });

      const access = await checkAccess(req.params.id, req, "contributor");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { agent_id } = req.body;
      if (!agent_id) return reply.status(400).send({ ok: false, error: "agent_id required" });

      const { rows: agents } = await db.query(
        `select id, owner_user_id from agents where id::text = $1`,
        [agent_id]
      );
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

      // Push project_onboarded to agent via WS
      const { rows: projects } = await db.query(
        `select id, slug, name, description, agent_briefing from projects where id = $1`,
        [access.projectId]
      );
      if (projects[0]) {
        const p = projects[0];
        pushToAgent(agent_id, "project_onboarded", {
          project_id:     p.id,
          project_slug:   p.slug,
          project_name:   p.name,
          description:    p.description,
          agent_briefing: p.agent_briefing,
        });
      }

      return reply.status(201).send({ ok: true, member: rows[0] });
    }
  );

  // ── Remove agent from team — admin+ ───────────────────────────────────────
  server.delete<{ Params: { id: string; agentId: string } }>(
    "/projects/:id/team/:agentId",
    async (req, reply) => {
      const userId = getRequestUser(req)?.userId ?? null;
      if (!userId) return reply.status(401).send({ ok: false, error: "authentication required" });

      const access = await checkAccess(req.params.id, req, "contributor");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { rows: agents } = await db.query(
        `select owner_user_id from agents where id::text = $1`,
        [req.params.agentId]
      );
      if (!agents[0]) return reply.status(404).send({ ok: false, error: "agent not found" });

      const canAdminProject = access.role === "owner" || access.role === "admin";
      const ownsAgent = agents[0].owner_user_id === userId;
      if (!canAdminProject && !ownsAgent) {
        return reply.status(403).send({ ok: false, error: "forbidden: you can only remove your own agents" });
      }

      await db.query(
        `delete from project_agents where project_id = $1 and agent_id = $2`,
        [access.projectId, req.params.agentId]
      );
      return { ok: true };
    }
  );

  // ── List user members — member+ ────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/projects/:id/user-members",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      const { rows } = await db.query(
        `select pum.id, pum.role, pum.joined_at,
                u.id as user_id, u.email, u.name, u.avatar_url,
                inv.name as invited_by_name
         from project_users pum
         join users u on u.id = pum.user_id
         left join users inv on inv.id = pum.invited_by
         where pum.project_id = $1
         order by pum.joined_at asc`,
        [access.projectId]
      );
      return { ok: true, members: rows };
    }
  );

  // ── Add user by email (invite-only) — admin+ ──────────────────────────────
  server.post<{ Params: { id: string }; Body: { email: string; role?: string } }>(
    "/projects/:id/user-members",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { email, role = "contributor" } = req.body;
      if (!email) return reply.status(400).send({ ok: false, error: "email required" });
      const normalizedEmail = email.trim().toLowerCase();

      // If already a member, don't auto-mutate anything.
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

      // Reuse active invite if one already exists for this email.
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
          invite: { ...existingInvite[0], invite_url: `${APP_BASE}/invite/project/${existingInvite[0].token}` },
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
        invite: { ...rows[0], invite_url: `${APP_BASE}/invite/project/${rows[0].token}` },
      });
    }
  );

  // ── Remove user member — admin+ ────────────────────────────────────────────
  server.delete<{ Params: { id: string; userId: string } }>(
    "/projects/:id/user-members/:userId",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });
      await db.query(
        `delete from project_users where project_id = $1 and user_id = $2`,
        [access.projectId, req.params.userId]
      );
      return { ok: true };
    }
  );

  // ── Generate invite — admin+ ───────────────────────────────────────────────
  const APP_BASE = process.env.APP_BASE_URL ?? "https://darshan.caringgems.in";

  server.post<{ Params: { id: string }; Body: { email?: string; role?: string } }>(
    "/projects/:id/invites",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "admin");
      if ("deny" in access) return reply.status(access.deny).send({ ok: false, error: access.deny === 404 ? "project not found" : "forbidden" });

      const { email, role = "contributor" } = req.body ?? {};
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
    "/projects/:id/invites",
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
    "/projects/:id/invites/:inviteId",
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
