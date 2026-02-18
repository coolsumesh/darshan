import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { appendAuditEvent } from "../audit.js";
import { broadcast } from "../broadcast.js";

function getUserId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const h = req.headers["x-user-id"];
  return (Array.isArray(h) ? h[0] : h) ?? "sumesh";
}

export async function registerProjects(server: FastifyInstance, db: pg.Pool) {

  // GET /api/v1/projects — list all projects
  server.get<{ Querystring: { status?: string } }>(
    "/api/v1/projects",
    async (req) => {
      const { status } = req.query;
      const { rows } = await db.query(
        `select p.*,
                count(pm.agent_id)::int as member_count
         from projects p
         left join project_members pm on pm.project_id = p.id
         ${status ? "where p.status = $1" : ""}
         group by p.id
         order by p.seq asc`,
        status ? [status] : []
      );
      return { ok: true, projects: rows };
    }
  );

  // GET /api/v1/projects/:id — single project with members
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id",
    async (req, reply) => {
      const { rows } = await db.query(
        `select p.*, count(pm.agent_id)::int as member_count
         from projects p
         left join project_members pm on pm.project_id = p.id
         where p.id = $1
         group by p.id`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return reply.status(404).send({ ok: false, error: "project not found" });
      }

      const { rows: members } = await db.query(
        `select a.*, pm.joined_at
         from project_members pm
         join agents a on a.id = pm.agent_id
         where pm.project_id = $1
         order by lower(a.name)`,
        [req.params.id]
      );

      return { ok: true, project: rows[0], members };
    }
  );

  // POST /api/v1/projects — create a project
  server.post<{
    Body: { name: string; description?: string };
  }>("/api/v1/projects", async (req, reply) => {
    const userId = getUserId(req);
    const { name, description = "" } = req.body ?? {};

    if (!name?.trim()) {
      return reply.status(400).send({ ok: false, error: "name is required" });
    }

    const { rows } = await db.query(
      `insert into projects (name, description, created_by)
       values ($1, $2, $3)
       returning *`,
      [name.trim(), description.trim(), userId]
    );
    const project = rows[0];

    await appendAuditEvent(db, {
      actor: { actor_type: "human", actor_user_id: userId },
      action: "project.create",
      resource_type: "project",
      resource_id: project.id,
      decision: "allow",
    });

    broadcast("project.created", { project });
    return reply.status(201).send({ ok: true, project });
  });

  // GET /api/v1/projects/:id/tasks — tasks scoped to a project
  server.get<{
    Params: { id: string };
    Querystring: { status?: string };
  }>("/api/v1/projects/:id/tasks", async (req, reply) => {
    const { id: projectId } = req.params;
    const { status } = req.query;

    const { rows: proj } = await db.query(
      `select id from projects where id = $1`,
      [projectId]
    );
    if (proj.length === 0) {
      return reply.status(404).send({ ok: false, error: "project not found" });
    }

    const { rows } = await db.query(
      `select t.*,
              a_prop.name  as proposed_by_agent_name,
              a_claim.name as claimed_by_agent_name
       from tasks t
       left join agents a_prop  on a_prop.id  = t.proposed_by_agent_id
       left join agents a_claim on a_claim.id = t.claimed_by_agent_id
       where t.project_id = $1
         ${status ? "and t.status = $2" : ""}
       order by t.seq desc`,
      status ? [projectId, status] : [projectId]
    );

    return { ok: true, tasks: rows };
  });

  // GET /api/v1/projects/:id/threads — threads scoped to a project
  server.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/threads",
    async (req, reply) => {
      const { id: projectId } = req.params;

      const { rows: proj } = await db.query(
        `select id from projects where id = $1`,
        [projectId]
      );
      if (proj.length === 0) {
        return reply.status(404).send({ ok: false, error: "project not found" });
      }

      const { rows } = await db.query(
        `select * from threads
         where project_id = $1 and archived_at is null
         order by updated_at desc`,
        [projectId]
      );

      return { ok: true, threads: rows };
    }
  );

  // POST /api/v1/projects/:id/members — add agent to project
  server.post<{
    Params: { id: string };
    Body: { agentId: string };
  }>("/api/v1/projects/:id/members", async (req, reply) => {
    const userId = getUserId(req);
    const { id: projectId } = req.params;
    const { agentId } = req.body ?? {};

    if (!agentId) {
      return reply.status(400).send({ ok: false, error: "agentId is required" });
    }

    try {
      const { rows } = await db.query(
        `insert into project_members (project_id, agent_id)
         values ($1, $2)
         on conflict do nothing
         returning *`,
        [projectId, agentId]
      );

      await appendAuditEvent(db, {
        actor: { actor_type: "human", actor_user_id: userId },
        action: "project.add_member",
        resource_type: "project",
        resource_id: projectId,
        decision: "allow",
        metadata: { agentId },
      });

      return reply.status(201).send({ ok: true, member: rows[0] ?? null });
    } catch {
      return reply.status(404).send({ ok: false, error: "project or agent not found" });
    }
  });

  // DELETE /api/v1/projects/:id/members/:agentId — remove agent from project
  server.delete<{ Params: { id: string; agentId: string } }>(
    "/api/v1/projects/:id/members/:agentId",
    async (req, reply) => {
      const userId = getUserId(req);
      const { id: projectId, agentId } = req.params;

      await db.query(
        `delete from project_members where project_id = $1 and agent_id = $2`,
        [projectId, agentId]
      );

      await appendAuditEvent(db, {
        actor: { actor_type: "human", actor_user_id: userId },
        action: "project.remove_member",
        resource_type: "project",
        resource_id: projectId,
        decision: "allow",
        metadata: { agentId },
      });

      return { ok: true };
    }
  );
}
