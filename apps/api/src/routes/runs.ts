import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { appendAuditEvent } from "../audit.js";
import { broadcast } from "../broadcast.js";

function getUserId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const h = req.headers["x-user-id"];
  return (Array.isArray(h) ? h[0] : h) ?? "sumesh";
}

export async function registerRuns(server: FastifyInstance, db: pg.Pool) {
  // List runs for a thread
  server.get<{
    Params: { id: string };
    Querystring: { limit?: string; status?: string };
  }>("/api/v1/threads/:id/runs", async (req, reply) => {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const { rows: thread } = await db.query(
      `select id from threads where id = $1`,
      [id]
    );
    if (thread.length === 0) {
      return reply.status(404).send({ ok: false, error: "thread not found" });
    }

    let query = `select r.*, a.name as target_agent_name
                 from runs r
                 join agents a on a.id = r.target_agent_id
                 where r.thread_id = $1`;
    const params: unknown[] = [id];

    if (req.query.status) {
      params.push(req.query.status);
      query += ` and r.status = $${params.length}`;
    }

    query += ` order by r.seq desc limit $${params.length + 1}`;
    params.push(limit);

    const { rows } = await db.query(query, params);
    return { ok: true, runs: rows };
  });

  // Get a single run
  server.get<{ Params: { id: string } }>(
    "/api/v1/runs/:id",
    async (req, reply) => {
      const { rows } = await db.query(
        `select r.*, a.name as target_agent_name
         from runs r
         join agents a on a.id = r.target_agent_id
         where r.id = $1`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return reply.status(404).send({ ok: false, error: "run not found" });
      }
      return { ok: true, run: rows[0] };
    }
  );

  // Cancel a run
  server.post<{ Params: { id: string } }>(
    "/api/v1/runs/:id/cancel",
    async (req, reply) => {
      const userId = getUserId(req);

      const { rows } = await db.query(
        `update runs
         set status = 'canceled', ended_at = now(), updated_at = now()
         where id = $1
           and status in ('queued', 'running')
         returning *`,
        [req.params.id]
      );

      if (rows.length === 0) {
        return reply.status(404).send({
          ok: false,
          error: "run not found or not cancelable",
        });
      }

      const run = rows[0];

      await appendAuditEvent(db, {
        actor: { actor_type: "human", actor_user_id: userId },
        action: "run.cancel",
        resource_type: "run",
        resource_id: run.id,
        thread_id: run.thread_id,
        run_id: run.id,
        decision: "allow",
      });

      broadcast("run.updated", { run });

      return { ok: true, run };
    }
  );
}
