import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";

export async function registerAgentLevels(server: FastifyInstance, db: pg.Pool) {

  // ── GET level definitions for a project ───────────────────────────────────
  server.get<{ Querystring: { project_id?: string } }>("/agent-levels/definitions", async (req, reply) => {
    const projectId = req.query.project_id?.trim();

    if (projectId) {
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
    }

    // Back-compat: when no project is provided, return distinct levels across all projects
    const { rows } = await db.query(
      `SELECT DISTINCT ON (level)
         null::uuid AS project_id,
         level AS level_id,
         name,
         name AS label,
         COALESCE(description, name) AS description,
         gate
       FROM project_level_definitions
       ORDER BY level, name`
    );
    return reply.send({ ok: true, definitions: rows });
  });

  // ── GET all agents with their level for a project ─────────────────────────
  server.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/agent-levels",
    async (req, reply) => {
      const { projectId } = req.params;
      const { rows } = await db.query(
        `SELECT
           apl.id, apl.agent_id, apl.project_id,
           apl.current_level, apl.created_at, apl.updated_at,
           a.name AS agent_name,
           a.slug AS agent_slug,
           COALESCE(d.name, 'L' || apl.current_level::text) AS level_name,
           COALESCE(d.name, 'L' || apl.current_level::text) AS level_label,
           COALESCE(d.name, 'L' || apl.current_level::text) AS level_description,
           null::boolean AS can_receive_tasks,
           null::int AS max_parallel_tasks,
           null::boolean AS requires_approval
         FROM agent_project_levels apl
         JOIN agents a ON a.id = apl.agent_id
         LEFT JOIN project_level_definitions d
           ON d.project_id = apl.project_id AND d.level = apl.current_level
         WHERE apl.project_id = $1
         ORDER BY apl.current_level DESC, a.name`,
        [projectId]
      );
      return reply.send({ ok: true, levels: rows });
    }
  );

  // ── GET current level + event history for one agent in a project ──────────
  server.get<{ Params: { projectId: string; agentId: string } }>(
    "/projects/:projectId/agent-levels/:agentId",
    async (req, reply) => {
      const { projectId, agentId } = req.params;

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
        [projectId, agentId]
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
        [projectId, agentId]
      );

      return reply.send({ ok: true, current: current ?? null, events, proofs: [] });
    }
  );

  // ── POST set/update agent level in a project (upsert) ─────────────────────
  server.post<{
    Params: { projectId: string; agentId: string };
    Body: {
      level: number;
      reason?: string;
      changed_by_type?: "agent" | "user";
    };
  }>(
    "/projects/:projectId/agent-levels/:agentId",
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

      const { projectId, agentId } = req.params;
      const { level, reason, changed_by_type = "user" } = req.body ?? {};

      if (typeof level !== "number") {
        return reply.status(400).send({ ok: false, error: "level (number) required" });
      }

      // Get current level (or default 0)
      const { rows: [existing] } = await db.query(
        `SELECT current_level FROM agent_project_levels WHERE project_id = $1 AND agent_id = $2`,
        [projectId, agentId]
      );
      const fromLevel = existing?.current_level ?? 0;

      // Upsert current level
      await db.query(
        `INSERT INTO agent_project_levels (project_id, agent_id, current_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, agent_id)
         DO UPDATE SET current_level = $3, updated_at = now()`,
        [projectId, agentId, level]
      );

      // Record event
      const { rows: [event] } = await db.query(
        `INSERT INTO agent_level_events
           (project_id, agent_id, from_level, to_level, changed_by, changed_by_type, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [projectId, agentId, fromLevel, level, callerId, changed_by_type, reason ?? null]
      );

      return reply.send({ ok: true, event_id: event.id });
    }
  );
}
