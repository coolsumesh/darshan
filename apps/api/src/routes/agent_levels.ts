import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";

export async function registerAgentLevels(server: FastifyInstance, db: pg.Pool) {

  // ── GET all level definitions ─────────────────────────────────────────────
  server.get("/agent-levels/definitions", async (_req, reply) => {
    const { rows } = await db.query(
      `SELECT * FROM agent_level_definitions ORDER BY level_id`
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
           a.name   AS agent_name,
           a.slug   AS agent_slug,
           d.name   AS level_name,
           d.label  AS level_label,
           d.description AS level_description,
           d.can_receive_tasks, d.max_parallel_tasks, d.requires_approval
         FROM agent_project_levels apl
         JOIN agents a ON a.id = apl.agent_id
         JOIN agent_level_definitions d ON d.level_id = apl.current_level
         WHERE apl.project_id = $1
         ORDER BY apl.current_level DESC, a.name`,
        [projectId]
      );
      return reply.send({ ok: true, levels: rows });
    }
  );

  // ── GET level + full event history for one agent in a project ─────────────
  server.get<{ Params: { projectId: string; agentId: string } }>(
    "/projects/:projectId/agent-levels/:agentId",
    async (req, reply) => {
      const { projectId, agentId } = req.params;

      const { rows: [current] } = await db.query(
        `SELECT apl.*, d.name AS level_name, d.label AS level_label,
                d.description AS level_description,
                d.can_receive_tasks, d.max_parallel_tasks, d.requires_approval
         FROM agent_project_levels apl
         JOIN agent_level_definitions d ON d.level_id = apl.current_level
         WHERE apl.project_id = $1 AND apl.agent_id = $2`,
        [projectId, agentId]
      );

      const { rows: events } = await db.query(
        `SELECT e.*,
                fd.label AS from_label, td.label AS to_label
         FROM agent_level_events e
         JOIN agent_level_definitions fd ON fd.level_id = e.from_level
         JOIN agent_level_definitions td ON td.level_id = e.to_level
         WHERE e.project_id = $1 AND e.agent_id = $2
         ORDER BY e.created_at DESC`,
        [projectId, agentId]
      );

      const eventIds = events.map((e: any) => e.id);
      let proofs: any[] = [];
      if (eventIds.length > 0) {
        const { rows } = await db.query(
          `SELECT * FROM agent_level_proofs WHERE event_id = ANY($1) ORDER BY created_at`,
          [eventIds]
        );
        proofs = rows;
      }

      return reply.send({ ok: true, current: current ?? null, events, proofs });
    }
  );

  // ── POST set/update agent level in a project (upsert) ─────────────────────
  server.post<{
    Params: { projectId: string; agentId: string };
    Body: {
      level: number;
      reason?: string;
      changed_by_type?: "agent" | "user";
      proofs?: Array<{ proof_type: "task" | "conversation" | "a2a_thread"; ref_id: string; notes?: string }>;
    };
  }>(
    "/projects/:projectId/agent-levels/:agentId",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { projectId, agentId } = req.params;
      const { level, reason, changed_by_type = "user", proofs = [] } = req.body ?? {};

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
        [projectId, agentId, fromLevel, level, user.userId, changed_by_type, reason ?? null]
      );

      // Insert proofs
      if (proofs.length > 0) {
        for (const p of proofs) {
          await db.query(
            `INSERT INTO agent_level_proofs (event_id, proof_type, ref_id, notes)
             VALUES ($1, $2, $3, $4)`,
            [event.id, p.proof_type, p.ref_id, p.notes ?? null]
          );
        }
      }

      return reply.send({ ok: true, event_id: event.id });
    }
  );
}
