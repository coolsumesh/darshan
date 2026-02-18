import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { appendAuditEvent } from "../audit.js";
import { broadcast } from "../broadcast.js";
import { processQueued } from "../connector.js";

function getUserId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const h = req.headers["x-user-id"];
  return (Array.isArray(h) ? h[0] : h) ?? "sumesh";
}

export async function registerMessages(server: FastifyInstance, db: pg.Pool) {
  // List messages for a thread (cursor pagination via seq)
  server.get<{
    Params: { id: string };
    Querystring: { limit?: string; beforeSeq?: string };
  }>("/api/v1/threads/:id/messages", async (req, reply) => {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const beforeSeq = req.query.beforeSeq ? BigInt(req.query.beforeSeq) : null;

    const { rows: thread } = await db.query(
      `select id from threads where id = $1`,
      [id]
    );
    if (thread.length === 0) {
      return reply.status(404).send({ ok: false, error: "thread not found" });
    }

    const { rows } = await db.query(
      `select * from messages
       where thread_id = $1
         and ($2::bigint is null or seq < $2)
       order by seq desc
       limit $3`,
      [id, beforeSeq, limit]
    );

    const nextBeforeSeq =
      rows.length === limit ? rows[rows.length - 1].seq : null;

    return { ok: true, messages: rows.reverse(), nextBeforeSeq };
  });

  // Post a message to a thread, optionally triggering agent runs
  server.post<{
    Params: { id: string };
    Body: {
      content: string;
      targets?: { agentIds?: string[] };
      mode?: "direct" | "broadcast";
    };
  }>("/api/v1/threads/:id/messages", async (req, reply) => {
    const { id: threadId } = req.params;
    const userId = getUserId(req);
    const { content, targets, mode = "direct" } = req.body ?? {};

    if (!content?.trim()) {
      return reply.status(400).send({ ok: false, error: "content is required" });
    }

    const { rows: threadRows } = await db.query(
      `select id from threads where id = $1`,
      [threadId]
    );
    if (threadRows.length === 0) {
      return reply.status(404).send({ ok: false, error: "thread not found" });
    }

    const client = await db.connect();
    try {
      await client.query("begin");

      // Persist the human message
      const { rows: msgRows } = await client.query(
        `insert into messages (thread_id, author_type, author_user_id, content)
         values ($1, 'human', $2, $3)
         returning *`,
        [threadId, userId, content]
      );
      const message = msgRows[0];

      // Update thread updated_at
      await client.query(
        `update threads set updated_at = now() where id = $1`,
        [threadId]
      );

      // Create runs for each target agent
      const agentIds = targets?.agentIds ?? [];
      const runs: unknown[] = [];

      for (const agentId of agentIds) {
        const { rows: runRows } = await client.query(
          `insert into runs
             (thread_id, requested_by_type, requested_by_user_id, target_agent_id,
              status, input_message_id)
           values ($1, 'human', $2, $3, 'queued', $4)
           returning *`,
          [threadId, userId, agentId, message.id]
        );
        runs.push(runRows[0]);
      }

      await client.query("commit");

      // Audit
      await appendAuditEvent(db, {
        actor: { actor_type: "human", actor_user_id: userId },
        action: "message.create",
        resource_type: "message",
        resource_id: message.id,
        thread_id: threadId,
        decision: "allow",
      });

      // Broadcast WS events
      broadcast("message.created", { message });
      for (const run of runs) {
        broadcast("run.created", { run });
      }

      // Kick off stub connector (non-blocking)
      if (agentIds.length > 0) {
        setTimeout(() => { processQueued(db).catch(() => {}); }, 0);
      }

      return { ok: true, message, runs };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  });
}
