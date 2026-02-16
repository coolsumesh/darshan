import type { FastifyInstance } from "fastify";
import type pg from "pg";

function parseSince(input: unknown): Date | null {
  if (typeof input !== "string" || input.trim() === "") return null;

  // Accept ISO string or epoch ms
  const asNum = Number(input);
  if (!Number.isNaN(asNum) && Number.isFinite(asNum) && asNum > 0) {
    const d = new Date(asNum);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

export async function registerOpsRateLimits(server: FastifyInstance, db: pg.Pool) {
  server.get(
    "/api/v1/ops/rate-limits",
    async (req): Promise<{ ok: true; events: unknown[] }> => {
      const q = req.query as { since?: string; limit?: string };

      const since = parseSince(q.since) ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
      const limitRaw = q.limit ? Number(q.limit) : 100;
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 500)
          : 100;

      const { rows } = await db.query(
        `
          select
            id,
            seq,
            created_at,
            actor_type,
            actor_user_id,
            actor_agent_id,
            thread_id,
            run_id,
            action,
            reason,
            metadata
          from audit_log
          where created_at >= $1
            and action = 'llm.fallback'
            and (
              (metadata->'error'->>'type') in ('timeout')
              or ((metadata->'error'->>'http_status')::int = 429)
              or ((metadata->'error'->>'http_status')::int between 500 and 599)
            )
          order by created_at desc
          limit $2
        `,
        [since.toISOString(), limit]
      );

      return { ok: true, events: rows };
    }
  );
}
