import type { FastifyInstance } from "fastify";
import type pg from "pg";

function getUserId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const h = req.headers["x-user-id"];
  return (Array.isArray(h) ? h[0] : h) ?? "sumesh";
}

export async function registerThreads(server: FastifyInstance, db: pg.Pool) {
  // List threads for the current user
  server.get("/api/v1/threads", async (req) => {
    const userId = getUserId(req);
    const { rows } = await db.query(
      `select t.*
       from threads t
       join thread_participants tp on tp.thread_id = t.id
       where tp.participant_type = 'human'
         and tp.user_id = $1
         and tp.can_read = true
         and t.archived_at is null
       order by t.updated_at desc`,
      [userId]
    );
    return { ok: true, threads: rows };
  });

  // Create a thread
  server.post<{ Body: { title?: string; visibility?: string } }>(
    "/api/v1/threads",
    async (req) => {
      const userId = getUserId(req);
      const title = req.body?.title ?? null;
      const visibility = req.body?.visibility ?? "private";

      const client = await db.connect();
      try {
        await client.query("begin");

        const { rows } = await client.query(
          `insert into threads (title, visibility, created_by_user_id)
           values ($1, $2, $3)
           returning *`,
          [title, visibility, userId]
        );
        const thread = rows[0];

        await client.query(
          `insert into thread_participants (thread_id, participant_type, user_id, can_read, can_write)
           values ($1, 'human', $2, true, true)`,
          [thread.id, userId]
        );

        await client.query("commit");
        return { ok: true, thread };
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // Get a single thread
  server.get<{ Params: { id: string } }>(
    "/api/v1/threads/:id",
    async (req, reply) => {
      const { rows } = await db.query(
        `select * from threads where id = $1`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return reply.status(404).send({ ok: false, error: "thread not found" });
      }
      return { ok: true, thread: rows[0] };
    }
  );

  // Archive a thread
  server.post<{ Params: { id: string } }>(
    "/api/v1/threads/:id/archive",
    async (req, reply) => {
      const { rowCount } = await db.query(
        `update threads set archived_at = now(), updated_at = now()
         where id = $1 and archived_at is null`,
        [req.params.id]
      );
      if (!rowCount) {
        return reply.status(404).send({ ok: false, error: "thread not found or already archived" });
      }
      return { ok: true };
    }
  );
}
