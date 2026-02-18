import type { FastifyInstance } from "fastify";
import type pg from "pg";

export async function registerAuditRoute(server: FastifyInstance, db: pg.Pool) {
  server.get<{
    Querystring: {
      limit?: string;
      since?: string;
      action?: string;
      thread_id?: string;
      run_id?: string;
    };
  }>("/api/v1/audit", async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const params: unknown[] = [since.toISOString(), limit];
    let where = `where created_at >= $1`;

    if (req.query.action) {
      params.push(req.query.action);
      where += ` and action = $${params.length}`;
    }
    if (req.query.thread_id) {
      params.push(req.query.thread_id);
      where += ` and thread_id = $${params.length}`;
    }
    if (req.query.run_id) {
      params.push(req.query.run_id);
      where += ` and run_id = $${params.length}`;
    }

    const { rows } = await db.query(
      `select * from audit_log ${where} order by seq desc limit $2`,
      params
    );

    return { ok: true, events: rows };
  });
}
