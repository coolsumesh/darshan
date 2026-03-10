import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";
import { appendAuditEvent } from "../audit.js";
import { broadcast } from "../broadcast.js";
import { processQueued } from "../connector.js";

async function ensureChatThread(db: pg.Pool, userId: string, agentId: string): Promise<{ threadId: string }> {
  const existing = await db.query<{ thread_id: string }>(
    `select thread_id from agent_chats where user_id = $1 and agent_id = $2`,
    [userId, agentId]
  );
  if (existing.rows[0]?.thread_id) return { threadId: existing.rows[0].thread_id };

  const client = await db.connect();
  try {
    await client.query("begin");

    const { rows: agentRows } = await client.query<{ name: string }>(
      `select name from agents where id = $1`,
      [agentId]
    );
    const agentName = agentRows[0]?.name ?? "Agent";

    const { rows: threadRows } = await client.query<{ id: string }>(
      `insert into threads (title, visibility, created_by_user_id)
       values ($1, 'private', $2)
       returning id`,
      [`Chat: ${agentName}`, userId]
    );

    const threadId = threadRows[0]!.id;

    await client.query(
      `insert into thread_participants (thread_id, participant_type, user_id, can_read, can_write)
       values ($1, 'human', $2, true, true)
       on conflict do nothing`,
      [threadId, userId]
    );

    await client.query(
      `insert into thread_participants (thread_id, participant_type, agent_id, can_read, can_write)
       values ($1, 'agent', $2, true, true)
       on conflict do nothing`,
      [threadId, agentId]
    );

    await client.query(
      `insert into agent_chats (user_id, agent_id, thread_id)
       values ($1, $2, $3)
       on conflict (user_id, agent_id) do update set thread_id = excluded.thread_id, updated_at = now()`,
      [userId, agentId, threadId]
    );

    await client.query("commit");
    return { threadId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function registerAgentChat(server: FastifyInstance, db: pg.Pool) {
  server.get("/agents/online", async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

    const { rows } = await db.query(
      `select a.id, a.name, a.description, a.model, a.provider, a.agent_type,
              a.last_ping_at, a.last_seen_at,
              case when a.last_ping_at > now() - interval '1 hour' then 'online' else 'offline' end as status
       from agents a
       where (a.owner_user_id = $1
          or exists (
            select 1
            from project_agents pa
            join projects p on p.id = pa.project_id
            left join project_users pu on pu.project_id = p.id and pu.user_id = $1
            where pa.agent_id = a.id
              and (p.owner_user_id = $1 or pu.user_id is not null)
          ))
       order by
         case when a.last_ping_at > now() - interval '1 hour' then 0 else 1 end,
         lower(a.name) asc`,
      [user.userId]
    );

    return { ok: true, agents: rows };
  });

  server.get<{ Params: { id: string } }>("/agents/:id/chat", async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

    const { rows: agentRows } = await db.query(
      `select id from agents where id::text = $1`,
      [req.params.id]
    );
    if (!agentRows.length) return reply.status(404).send({ ok: false, error: "agent not found" });

    const { threadId } = await ensureChatThread(db, user.userId, req.params.id);
    return { ok: true, thread_id: threadId };
  });

  server.get<{ Params: { id: string }; Querystring: { limit?: string; beforeSeq?: string } }>(
    "/agents/:id/chat/messages",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { threadId } = await ensureChatThread(db, user.userId, req.params.id);
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const beforeSeq = req.query.beforeSeq ? BigInt(req.query.beforeSeq) : null;

      const { rows } = await db.query(
        `select * from messages
         where thread_id = $1
           and ($2::bigint is null or seq < $2)
         order by seq desc
         limit $3`,
        [threadId, beforeSeq, limit]
      );

      const nextBeforeSeq = rows.length === limit ? rows[rows.length - 1].seq : null;
      return { ok: true, thread_id: threadId, messages: rows.reverse(), nextBeforeSeq };
    }
  );

  server.post<{ Params: { id: string }; Body: { content: string } }>(
    "/agents/:id/chat/messages",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const content = req.body?.content?.trim();
      if (!content) return reply.status(400).send({ ok: false, error: "content is required" });

      const { threadId } = await ensureChatThread(db, user.userId, req.params.id);

      const client = await db.connect();
      try {
        await client.query("begin");

        const { rows: msgRows } = await client.query(
          `insert into messages (thread_id, author_type, author_user_id, content)
           values ($1, 'human', $2, $3)
           returning *`,
          [threadId, user.userId, content]
        );
        const message = msgRows[0];

        const { rows: runRows } = await client.query(
          `insert into runs
             (thread_id, requested_by_type, requested_by_user_id, target_agent_id, status, input_message_id)
           values ($1, 'human', $2, $3, 'queued', $4)
           returning *`,
          [threadId, user.userId, req.params.id, message.id]
        );
        const run = runRows[0];

        await client.query(`update threads set updated_at = now() where id = $1`, [threadId]);

        await client.query("commit");

        await appendAuditEvent(db, {
          actor: { actor_type: "human", actor_user_id: user.userId },
          action: "agent_chat.message.create",
          resource_type: "message",
          resource_id: message.id,
          thread_id: threadId,
          decision: "allow",
        });

        broadcast("message.created", { message });
        broadcast("run.created", { run });

        setTimeout(() => {
          processQueued(db).catch(() => {});
        }, 0);

        return { ok: true, thread_id: threadId, message, run };
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  );
}
