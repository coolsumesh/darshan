import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { broadcast } from "../broadcast.js";
import { getRequestUser } from "./auth.js";

export async function registerProjects(server: FastifyInstance, db: pg.Pool) {

  // ── List all projects ──────────────────────────────────────────────────────
  server.get("/api/v1/projects", async (req) => {
    const userId = getRequestUser(req)?.userId ?? null;
    const { rows: projects } = await db.query(
      `select p.*,
              count(distinct pt.agent_id)::int as team_size,
              max(t.updated_at) as last_activity
       from projects p
       left join project_team pt on pt.project_id = p.id
       left join tasks t on t.project_id = p.id
       where p.status != 'archived'
         and ($1::uuid is null or p.owner_user_id = $1::uuid)
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
      const { rows } = await db.query(
        `select p.*,
                count(distinct pt.agent_id)::int as team_size,
                max(t.updated_at) as last_activity
         from projects p
         left join project_team pt on pt.project_id = p.id
         left join tasks t on t.project_id = p.id
         where p.id::text = $1 or lower(p.slug) = lower($1)
         group by p.id`,
        [req.params.id]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      return { ok: true, project: rows[0] };
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

  // ── Update project ─────────────────────────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/v1/projects/:id",
    async (req, reply) => {
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
      vals.push(req.params.id);
      const { rows } = await db.query(
        `update projects set ${sets.join(", ")}, updated_at = now()
         where id::text = $${vals.length} or lower(slug) = lower($${vals.length}) returning *`,
        vals
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      return { ok: true, project: rows[0] };
    }
  );

  // ── Get architecture doc ───────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/architecture",
    async (req, reply) => {
      const { rows } = await db.query(
        `select architecture_doc as content from projects where id::text = $1 or lower(slug) = lower($1)`,
        [req.params.id]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      return { ok: true, content: rows[0].content };
    }
  );

  // ── Update architecture doc ────────────────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: { content: string } }>(
    "/api/v1/projects/:id/architecture",
    async (req, reply) => {
      const { rows } = await db.query(
        `update projects set architecture_doc = $1, updated_at = now()
         where id::text = $2 or lower(slug) = lower($2) returning id`,
        [req.body.content, req.params.id]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      return { ok: true };
    }
  );

  // ── Get tech spec doc ──────────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/tech-spec",
    async (req, reply) => {
      const { rows } = await db.query(
        `select tech_spec_doc as content from projects where id::text = $1 or lower(slug) = lower($1)`,
        [req.params.id]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      return { ok: true, content: rows[0].content };
    }
  );

  // ── Update tech spec doc ───────────────────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: { content: string } }>(
    "/api/v1/projects/:id/tech-spec",
    async (req, reply) => {
      const { rows } = await db.query(
        `update projects set tech_spec_doc = $1, updated_at = now()
         where id::text = $2 or lower(slug) = lower($2) returning id`,
        [req.body.content, req.params.id]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      return { ok: true };
    }
  );

  // ── List tasks for project ─────────────────────────────────────────────────
  server.get<{ Params: { id: string }; Querystring: { status?: string; assignee?: string } }>(
    "/api/v1/projects/:id/tasks",
    async (req, reply) => {
      const { rows: project } = await db.query(
        `select id from projects where id::text = $1 or lower(slug) = lower($1)`,
        [req.params.id]
      );
      if (!project[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      const conditions = ["project_id = $1"];
      const vals: unknown[] = [project[0].id];
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

  // ── Helper: write task_assigned to agent inbox by agent name ───────────────
  async function notifyAgentInbox(agentName: string, task: Record<string, unknown>) {
    if (!agentName) return;
    const { rows: agents } = await db.query(
      `select id from agents where name ILIKE $1 limit 1`,
      [agentName]
    );
    if (!agents[0]) return;
    await db.query(
      `insert into agent_inbox (agent_id, type, payload)
       values ($1, 'task_assigned', $2)`,
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

  // ── Create task ────────────────────────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { title: string; description?: string; proposer?: string; assignee?: string; status?: string; priority?: string; type?: string; estimated_sp?: number; due_date?: string } }>(
    "/api/v1/projects/:id/tasks",
    async (req, reply) => {
      const { rows: project } = await db.query(
        `select id from projects where id::text = $1 or lower(slug) = lower($1)`,
        [req.params.id]
      );
      if (!project[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      const { title, description = "", assignee, status = "proposed", priority = "medium", type = "Task", due_date } = req.body;
      if (!title) return reply.status(400).send({ ok: false, error: "title required" });

      // Resolve requestor from auth user (cookie session) or fallback to body proposer
      const authUser = getRequestUser(req);
      const requestorName = authUser?.name ?? req.body.proposer ?? null;
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
        [project[0].id, title, description, requestorName, requestorOrg, assignee ?? null, status, priority, type, due_date ?? null]
      );
      broadcast("task:created", { task: rows[0] });
      if (assignee) await notifyAgentInbox(assignee, rows[0]);
      return reply.status(201).send({ ok: true, task: rows[0] });
    }
  );

  // ── Delete task ────────────────────────────────────────────────────────────
  server.delete<{ Params: { id: string; taskId: string } }>(
    "/api/v1/projects/:id/tasks/:taskId",
    async (req, reply) => {
      const { rowCount } = await db.query(
        `delete from tasks where id = $1 returning id`,
        [req.params.taskId]
      );
      if (!rowCount) return reply.status(404).send({ ok: false, error: "task not found" });
      // Remove all inbox items for this task so agents don't act on deleted tasks
      await db.query(
        `delete from agent_inbox
         where type = 'task_assigned'
           and payload->>'task_id' = $1`,
        [req.params.taskId]
      );
      broadcast("task:deleted", { taskId: req.params.taskId });
      return { ok: true };
    }
  );

  // ── Update task ────────────────────────────────────────────────────────────
  server.patch<{ Params: { id: string; taskId: string }; Body: Record<string, unknown> }>(
    "/api/v1/projects/:id/tasks/:taskId",
    async (req, reply) => {
      const allowed = ["title", "description", "status", "assignee", "proposer", "type", "estimated_sp", "priority", "due_date"];
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          vals.push(req.body[key]);
          sets.push(`${key} = $${vals.length}`);
        }
      }
      if (!sets.length) return reply.status(400).send({ ok: false, error: "nothing to update" });

      // Fetch old task so we can detect assignee changes
      const { rows: before } = await db.query(
        `select assignee from tasks where id = $1`, [req.params.taskId]
      );
      const oldAssignee: string | null = before[0]?.assignee ?? null;

      vals.push(req.params.taskId);
      const { rows } = await db.query(
        `update tasks set ${sets.join(", ")}, updated_at = now()
         where id = $${vals.length} returning *`,
        vals
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "task not found" });
      broadcast("task:updated", { task: rows[0] });

      // Handle assignee change
      const newAssignee = req.body.assignee as string | undefined;
      if (newAssignee !== undefined) {
        // Remove old agent's pending inbox item for this task (if any)
        if (oldAssignee) {
          await db.query(
            `delete from agent_inbox
             where type = 'task_assigned'
               and payload->>'task_id' = $1
               and agent_id = (select id from agents where name ILIKE $2 limit 1)`,
            [req.params.taskId, oldAssignee]
          );
        }
        // Notify new agent (if set)
        if (newAssignee) await notifyAgentInbox(newAssignee, rows[0]);
      }
      return { ok: true, task: rows[0] };
    }
  );

  // ── Get team for project ───────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/team",
    async (req, reply) => {
      const { rows: project } = await db.query(
        `select id from projects where id::text = $1 or lower(slug) = lower($1)`,
        [req.params.id]
      );
      if (!project[0]) return reply.status(404).send({ ok: false, error: "project not found" });
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
        [project[0].id]
      );
      return { ok: true, team: rows };
    }
  );

  // ── Add agent to project team ──────────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { agent_id: string; role?: string } }>(
    "/api/v1/projects/:id/team",
    async (req, reply) => {
      const { rows: project } = await db.query(
        `select id from projects where id::text = $1 or lower(slug) = lower($1)`,
        [req.params.id]
      );
      if (!project[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      const { agent_id, role = "Member" } = req.body;
      if (!agent_id) return reply.status(400).send({ ok: false, error: "agent_id required" });
      const { rows } = await db.query(
        `insert into project_team (project_id, agent_id, role)
         values ($1, $2, $3)
         on conflict (project_id, agent_id) do update set role = excluded.role
         returning *`,
        [project[0].id, agent_id, role]
      );
      return reply.status(201).send({ ok: true, member: rows[0] });
    }
  );

  // ── Remove agent from project team ────────────────────────────────────────
  server.delete<{ Params: { id: string; agentId: string } }>(
    "/api/v1/projects/:id/team/:agentId",
    async (req, reply) => {
      const { rows: project } = await db.query(
        `select id from projects where id::text = $1 or lower(slug) = lower($1)`,
        [req.params.id]
      );
      if (!project[0]) return reply.status(404).send({ ok: false, error: "project not found" });
      await db.query(
        `delete from project_team where project_id = $1 and agent_id = $2`,
        [project[0].id, req.params.agentId]
      );
      return { ok: true };
    }
  );
}
