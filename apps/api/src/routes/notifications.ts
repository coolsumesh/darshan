import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";

type Caller = {
  id: string;
  slug: string;
  type: "user" | "agent";
};

type DbExecutor = Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">;

const TARGETED_REPLY_MESSAGE_INTENTS = new Set(["answer", "review_request", "blocked"]);
let targetedNotificationReplyViolationCount = 0;

async function resolveCaller(req: FastifyRequest, db: pg.Pool) {
  const jwtUser = getRequestUser(req);
  if (jwtUser) {
    const slug = jwtUser.name?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_") ?? "USER";
    return { id: jwtUser.userId, slug, type: "user" } satisfies Caller;
  }
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return null;
  const { rows } = await db.query(
    `SELECT id, slug FROM agents WHERE callback_token = $1 LIMIT 1`, [bearer]
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    slug: rows[0].slug ?? rows[0].id.slice(0, 8).toUpperCase(),
    type: "agent",
  } satisfies Caller;
}

async function loadActiveThreadNextReplyForParticipant(db: DbExecutor, threadId: string, participantId: string) {
  const { rows } = await db.query(
    `SELECT thread_id, mode, pending_participant_ids
     FROM thread_next_reply
     WHERE thread_id = $1
       AND cleared_at IS NULL
       AND $2::uuid = ANY(pending_participant_ids)
     LIMIT 1`,
    [threadId, participantId]
  );
  return rows[0] as { thread_id: string; mode: "any" | "all"; pending_participant_ids: string[] } | undefined;
}

async function hasQualifyingThreadReplySince(
  db: DbExecutor,
  threadId: string,
  senderId: string,
  since: string
) {
  const { rows } = await db.query(
    `SELECT 1
     FROM thread_messages
     WHERE thread_id = $1
       AND sender_id = $2
       AND sent_at >= $3
       AND intent = ANY($4::text[])
     LIMIT 1`,
    [threadId, senderId, since, Array.from(TARGETED_REPLY_MESSAGE_INTENTS)]
  );
  return !!rows[0];
}

async function resolveThreadNextReplyForParticipant(db: DbExecutor, threadId: string, participantId: string) {
  const nextReply = await loadActiveThreadNextReplyForParticipant(db, threadId, participantId);
  if (!nextReply) return;

  if (nextReply.mode === "any") {
    await db.query(
      `UPDATE thread_next_reply
       SET cleared_at = now()
       WHERE thread_id = $1
         AND cleared_at IS NULL`,
      [threadId]
    );
    await db.query(
      `UPDATE threads
       SET has_reply_pending = false
       WHERE thread_id = $1`,
      [threadId]
    );
    return;
  }

  const remainingParticipantIds = nextReply.pending_participant_ids.filter((id) => id !== participantId);
  if (remainingParticipantIds.length === 0) {
    await db.query(
      `UPDATE thread_next_reply
       SET cleared_at = now()
       WHERE thread_id = $1
         AND cleared_at IS NULL`,
      [threadId]
    );
    await db.query(
      `UPDATE threads
       SET has_reply_pending = false
       WHERE thread_id = $1`,
      [threadId]
    );
    return;
  }

  await db.query(
    `UPDATE thread_next_reply
     SET pending_participant_ids = $2::uuid[]
     WHERE thread_id = $1
       AND cleared_at IS NULL`,
    [threadId, remainingParticipantIds]
  );
  await db.query(
    `UPDATE threads
     SET has_reply_pending = true
     WHERE thread_id = $1`,
    [threadId]
  );
}

export async function registerNotifications(server: FastifyInstance, db: pg.Pool) {

  // ── GET /api/v1/notifications — poll pending ───────────────────────────────
  server.get<{
    Querystring: { status?: string; limit?: string; priority?: string };
  }>(
    "/notifications",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const status   = req.query.status ?? "pending";
      const priority = req.query.priority;
      const lim      = Math.min(Number(req.query.limit ?? 50), 200);

      const conditions = ["n.recipient_id = $1"];
      const params: unknown[] = [caller.id];

      if (status !== "all") {
        params.push(status);
        conditions.push(`n.status = $${params.length}`);
      }
      if (priority) {
        params.push(priority);
        conditions.push(`n.priority = $${params.length}`);
      }

      params.push(lim);

      const { rows } = await db.query(
        `SELECT
           n.*,
           tm.body        AS message_body,
           tm.sender_slug AS message_from,
           tm.thread_id,
           tm.type        AS message_type,
           t.subject      AS thread_subject,
           (a.id IS NOT NULL) AS sender_is_agent
         FROM notifications n
         JOIN thread_messages tm ON tm.message_id = n.message_id
         JOIN threads t ON t.thread_id = tm.thread_id
         LEFT JOIN agents a ON a.id = tm.sender_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY
           CASE n.priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
           n.created_at ASC
         LIMIT $${params.length}`,
        params
      );

      return { ok: true, notifications: rows, count: rows.length };
    }
  );

  // ── POST /api/v1/notifications/:id/process — mark processed ───────────────
  server.post<{
    Params: { id: string };
    Body: {
      response_note?: string;
      emit_blocked?: boolean;
      awaiting_on?: "user" | "agent";
      next_expected_from?: string;
    };
  }>(
    "/notifications/:id/process",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const {
        response_note,
        emit_blocked = false,
        awaiting_on,
        next_expected_from,
      } = req.body ?? {};

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const { rows: [notif] } = await client.query(
          `SELECT n.*, tm.thread_id
           FROM notifications n
           JOIN thread_messages tm ON tm.message_id = n.message_id
           WHERE n.notification_id = $1
             AND n.recipient_id = $2
           FOR UPDATE`,
          [req.params.id, caller.id]
        );

        if (!notif) {
          await client.query("ROLLBACK");
          return reply.status(404).send({ ok: false, error: "notification not found or not yours" });
        }

        const threadId = String(notif.thread_id);
        const isTargetedAgentNotification =
          caller.type === "agent" &&
          !!(await loadActiveThreadNextReplyForParticipant(client, threadId, caller.id));

        if (isTargetedAgentNotification) {
          const hasQualifyingReply = await hasQualifyingThreadReplySince(
            client,
            threadId,
            caller.id,
            notif.created_at
          );

          if (!hasQualifyingReply && !emit_blocked) {
            targetedNotificationReplyViolationCount += 1;
            req.log.warn(
              {
                notification_id: req.params.id,
                thread_id: threadId,
                agent_id: caller.id,
                metric: "targeted_notification_reply_violation",
                targeted_notification_reply_violation_count: targetedNotificationReplyViolationCount,
              },
              "refused silent processing for targeted notification without reply or blocked escalation"
            );
            await client.query("ROLLBACK");
            return reply.status(409).send({
              ok: false,
              error: "targeted notifications require a thread reply or explicit blocked escalation before processing",
            });
          }

          if (!hasQualifyingReply && emit_blocked) {
            const blockedNote = response_note?.trim();
            const normalizedAwaitingOn = typeof awaiting_on === "string" ? awaiting_on.trim().toLowerCase() : "";
            const normalizedNextExpectedFrom = typeof next_expected_from === "string" ? next_expected_from.trim() : "";

            if (!blockedNote) {
              await client.query("ROLLBACK");
              return reply.status(400).send({ ok: false, error: "response_note is required when emit_blocked=true" });
            }
            if (normalizedAwaitingOn !== "user" && normalizedAwaitingOn !== "agent") {
              await client.query("ROLLBACK");
              return reply.status(400).send({ ok: false, error: "awaiting_on must be user or agent when emit_blocked=true" });
            }
            if (!normalizedNextExpectedFrom) {
              await client.query("ROLLBACK");
              return reply.status(400).send({ ok: false, error: "next_expected_from is required when emit_blocked=true" });
            }

            await client.query(
              `INSERT INTO thread_messages (
                 thread_id, sender_id, sender_slug, body,
                 intent, awaiting_on, next_expected_from
               )
               VALUES ($1, $2, $3, $4, 'blocked', $5, $6)`,
              [threadId, caller.id, caller.slug, blockedNote, normalizedAwaitingOn, normalizedNextExpectedFrom]
            );
          }

          await resolveThreadNextReplyForParticipant(client, threadId, caller.id);
        }

        const { rows: [updatedNotif] } = await client.query(
          `UPDATE notifications
           SET status = 'processed', processed_at = now(), response_note = COALESCE($1, response_note)
           WHERE notification_id = $2 AND recipient_id = $3
           RETURNING *`,
          [response_note ?? null, req.params.id, caller.id]
        );

        await client.query("COMMIT");
        return { ok: true, notification: updatedNotif };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  );
}
