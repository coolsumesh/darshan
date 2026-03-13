import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";

const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "824cdfcdec0e35cf550002c2dfa3541932f58e2e2497cfaa3c844dc99f5b972f";

export async function registerAgentLevels(server: FastifyInstance, db: pg.Pool) {
  function getBearerToken(req: FastifyRequest): string {
    return (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  }

  // Returns true for: JWT user with project access, internal API key, or project agent callback token
  async function canAccessProject(req: FastifyRequest, projectId?: string): Promise<boolean> {
    if (!projectId?.trim()) return false;

    const bearer = getBearerToken(req);

    // Internal API key — full access
    if (bearer === INTERNAL_API_KEY) return true;

    // Agent callback token — must belong to an agent in this project
    if (bearer) {
      const { rows } = await db.query(
        `SELECT 1 FROM agents a
         JOIN project_agents pa ON pa.agent_id = a.id
         WHERE a.callback_token = $1 AND pa.project_id = $2
         LIMIT 1`,
        [bearer, projectId]
      );
      if (rows[0]) return true;
    }

    // JWT user — must be owner or project member
    const user = getRequestUser(req);
    if (!user) return false;

    const { rows } = await db.query(
      `SELECT 1
       FROM projects p
       LEFT JOIN project_users pu ON pu.project_id = p.id
       WHERE p.id = $1 AND (p.owner_user_id = $2 OR pu.user_id = $2)
       LIMIT 1`,
      [projectId, user.userId]
    );
    return !!rows[0];
  }

  // ── GET level definitions for a project ───────────────────────────────────
  server.get<{ Querystring: { project_id?: string } }>("/agent-levels/definitions", async (req, reply) => {
    const projectId = req.query.project_id?.trim();

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: "project_id is required" });
    }

    const allowed = await canAccessProject(req, projectId);
    if (!allowed) return reply.status(403).send({ ok: false, error: "forbidden" });

    const { rows } = await db.query(
      `SELECT
         project_id,
         level AS level_id,
         name,
         name AS label,
         COALESCE(description, name) AS description,
         gate
       FROM project_level_definitions
       WHERE project_id = $1
       ORDER BY level`,
      [projectId]
    );
    return reply.send({ ok: true, definitions: rows });
  });

  // ── GET all agents with their level for a project ─────────────────────────
  server.get<{ Params: { id: string } }>(
    "/projects/:id/agent-levels",
    async (req, reply) => {
      const { id } = req.params;
      const allowed = await canAccessProject(req, id);
      if (!allowed) return reply.status(403).send({ ok: false, error: "forbidden" });

      const { rows } = await db.query(
        `SELECT
           COALESCE(apl.id, pa.agent_id) AS id,
           pa.agent_id,
           pa.project_id,
           COALESCE(apl.current_level, 0) AS current_level,
           COALESCE(apl.created_at, now()) AS created_at,
           COALESCE(apl.updated_at, now()) AS updated_at,
           a.name AS agent_name,
           a.slug AS agent_slug,
           COALESCE(d.name, 'L' || COALESCE(apl.current_level, 0)::text) AS level_name,
           COALESCE(d.name, 'L' || COALESCE(apl.current_level, 0)::text) AS level_label,
           COALESCE(d.name, 'L' || COALESCE(apl.current_level, 0)::text) AS level_description,
           null::boolean AS can_receive_tasks,
           null::int AS max_parallel_tasks,
           null::boolean AS requires_approval
         FROM project_agents pa
         JOIN agents a ON a.id = pa.agent_id
         LEFT JOIN agent_project_levels apl
           ON apl.project_id = pa.project_id AND apl.agent_id = pa.agent_id
         LEFT JOIN project_level_definitions d
           ON d.project_id = pa.project_id AND d.level = COALESCE(apl.current_level, 0)
         WHERE pa.project_id = $1
         ORDER BY COALESCE(apl.current_level, 0) DESC, a.name`,
        [id]
      );
      return reply.send({ ok: true, levels: rows });
    }
  );

  // ── GET current level + event history for one agent in a project ──────────
  server.get<{ Params: { id: string; agentId: string } }>(
    "/projects/:id/agent-levels/:agentId",
    async (req, reply) => {
      const { id, agentId } = req.params;
      const allowed = await canAccessProject(req, id);
      if (!allowed) return reply.status(403).send({ ok: false, error: "forbidden" });

      const { rows: [current] } = await db.query(
        `SELECT apl.*,
                COALESCE(d.name, 'L' || apl.current_level::text) AS level_name,
                COALESCE(d.name, 'L' || apl.current_level::text) AS level_label,
                COALESCE(d.name, 'L' || apl.current_level::text) AS level_description,
                null::boolean AS can_receive_tasks,
                null::int AS max_parallel_tasks,
                null::boolean AS requires_approval
         FROM agent_project_levels apl
         LEFT JOIN project_level_definitions d
           ON d.project_id = apl.project_id AND d.level = apl.current_level
         WHERE apl.project_id = $1 AND apl.agent_id = $2`,
        [id, agentId]
      );

      const { rows: events } = await db.query(
        `SELECT e.*,
                COALESCE(fd.name, 'L' || e.from_level::text) AS from_label,
                COALESCE(td.name, 'L' || e.to_level::text) AS to_label,
                COALESCE(fd.name, 'L' || e.from_level::text) AS from_name,
                COALESCE(td.name, 'L' || e.to_level::text) AS to_name
         FROM agent_level_events e
         LEFT JOIN project_level_definitions fd
           ON fd.project_id = e.project_id AND fd.level = e.from_level
         LEFT JOIN project_level_definitions td
           ON td.project_id = e.project_id AND td.level = e.to_level
         WHERE e.project_id = $1 AND e.agent_id = $2
         ORDER BY e.created_at DESC`,
        [id, agentId]
      );

      return reply.send({ ok: true, current: current ?? null, events, proofs: [] });
    }
  );

  // ── POST set/update agent level in a project (upsert) ─────────────────────
  server.post<{
    Params: { id: string; agentId: string };
    Body: {
      level: number;
      reason?: string;
      changed_by_type?: "agent" | "user" | "coordinator";
    };
  }>(
    "/projects/:id/agent-levels/:agentId",
    async (req, reply) => {
      const user = getRequestUser(req);
      const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
      const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "824cdfcdec0e35cf550002c2dfa3541932f58e2e2497cfaa3c844dc99f5b972f";

      // Accept: JWT user, internal API key, or agent callback token (coordinator)
      let authenticated = false;
      let callerId: string | null = null; // UUID for changed_by — null for internal key
      if (user) { authenticated = true; callerId = user.userId; }
      else if (bearer === INTERNAL_API_KEY) { authenticated = true; callerId = null; }
      else if (bearer) {
        const { rows: [agent] } = await db.query(
          `SELECT id FROM agents WHERE callback_token = $1 LIMIT 1`, [bearer]
        );
        if (agent) { authenticated = true; callerId = agent.id; }
      }
      if (!authenticated) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { id, agentId } = req.params;
      if (user) {
        const allowed = await canAccessProject(req, id);
        if (!allowed) return reply.status(403).send({ ok: false, error: "forbidden" });
      }

      const { level, reason, changed_by_type = "user" } = req.body ?? {};

      if (typeof level !== "number") {
        return reply.status(400).send({ ok: false, error: "level (number) required" });
      }

      // Get current level (or default 0)
      const { rows: [existing] } = await db.query(
        `SELECT current_level FROM agent_project_levels WHERE project_id = $1 AND agent_id = $2`,
        [id, agentId]
      );
      const fromLevel = existing?.current_level ?? 0;

      // Upsert current level
      await db.query(
        `INSERT INTO agent_project_levels (project_id, agent_id, current_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, agent_id)
         DO UPDATE SET current_level = $3, updated_at = now()`,
        [id, agentId, level]
      );

      // Record event
      const { rows: [event] } = await db.query(
        `INSERT INTO agent_level_events
           (project_id, agent_id, from_level, to_level, changed_by, changed_by_type, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [id, agentId, fromLevel, level, callerId, changed_by_type, reason ?? null]
      );

      return reply.send({ ok: true, event_id: event.id });
    }
  );

  // ── DELETE remove agent level row in a project ────────────────────────────
  server.delete<{ Params: { id: string; agentId: string } }>(
    "/projects/:id/agent-levels/:agentId",
    async (req, reply) => {
      const { id, agentId } = req.params;
      const allowed = await canAccessProject(req, id);
      if (!allowed) return reply.status(403).send({ ok: false, error: "forbidden" });

      await db.query(
        `DELETE FROM agent_project_levels WHERE project_id = $1 AND agent_id = $2`,
        [id, agentId]
      );

      return reply.send({ ok: true });
    }
  );
}
