import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";

const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "824cdfcdec0e35cf550002c2dfa3541932f58e2e2497cfaa3c844dc99f5b972f";

async function resolvePostCaller(req: FastifyRequest, db: pg.Pool): Promise<{ id: string } | null> {
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return null;

  // 1. Internal API key
  if (bearer === INTERNAL_API_KEY) return { id: "internal" };

  // 2. Agent callback token
  const { rows } = await db.query(
    `SELECT id FROM agents WHERE callback_token = $1 LIMIT 1`, [bearer]
  );
  if (rows[0]) return { id: rows[0].id };

  return null;
}

export async function registerUsage(server: FastifyInstance, db: pg.Pool) {

  // ── POST /api/v1/usage — record token usage event ─────────────────────────
  server.post<{
    Body: {
      session_key: string;
      thread_id?: string;
      agent_id?: string;
      model?: string;
      tokens_delta: number;
      tokens_total: number;
      context_tokens?: number;
    };
  }>(
    "/usage",
    async (req, reply) => {
      const caller = await resolvePostCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { session_key, thread_id, agent_id, model, tokens_delta, tokens_total, context_tokens } = req.body ?? {};
      if (!session_key) return reply.status(400).send({ ok: false, error: "session_key is required" });
      if (tokens_delta == null) return reply.status(400).send({ ok: false, error: "tokens_delta is required" });
      if (tokens_total == null) return reply.status(400).send({ ok: false, error: "tokens_total is required" });

      const { rows: [row] } = await db.query(
        `INSERT INTO llm_usage_events
           (session_key, thread_id, agent_id, model, tokens_delta, tokens_total, context_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          session_key,
          thread_id ?? null,
          agent_id ?? null,
          model ?? "unknown",
          tokens_delta,
          tokens_total,
          context_tokens ?? null,
        ]
      );

      return { ok: true, id: row.id };
    }
  );

  // ── GET /api/v1/usage — query usage events ────────────────────────────────
  server.get<{
    Querystring: {
      thread_id?: string;
      agent_id?: string;
      from?: string;
      to?: string;
      limit?: string;
    };
  }>(
    "/usage",
    async (req, reply) => {
      const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
      const jwtUser = getRequestUser(req);
      const isInternal = bearer === INTERNAL_API_KEY;
      if (!jwtUser && !isInternal) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { thread_id, agent_id, from, to, limit = "100" } = req.query;
      const lim = Math.min(Number(limit), 500);

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (thread_id) {
        params.push(thread_id);
        conditions.push(`thread_id = $${params.length}`);
      }
      if (agent_id) {
        params.push(agent_id);
        conditions.push(`agent_id = $${params.length}`);
      }
      if (from) {
        params.push(from);
        conditions.push(`recorded_at >= $${params.length}`);
      }
      if (to) {
        params.push(to);
        conditions.push(`recorded_at <= $${params.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      params.push(lim);

      const { rows: events } = await db.query(
        `SELECT * FROM llm_usage_events ${where}
         ORDER BY recorded_at DESC
         LIMIT $${params.length}`,
        params
      );

      // Aggregates
      const { rows: [agg] } = await db.query(
        `SELECT COALESCE(SUM(tokens_delta), 0)::int AS total_tokens,
                COUNT(*)::int AS total_events
         FROM llm_usage_events ${where}`,
        params.slice(0, -1) // exclude limit
      );

      const { rows: byModelRows } = await db.query(
        `SELECT model, COALESCE(SUM(tokens_delta), 0)::int AS tokens
         FROM llm_usage_events ${where}
         GROUP BY model ORDER BY tokens DESC`,
        params.slice(0, -1)
      );

      const by_model: Record<string, number> = {};
      for (const r of byModelRows) by_model[r.model] = r.tokens;

      return {
        ok: true,
        events,
        total_tokens: agg.total_tokens,
        total_events: agg.total_events,
        by_model,
      };
    }
  );
}
