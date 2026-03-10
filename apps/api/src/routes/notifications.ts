import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";

async function resolveCaller(req: FastifyRequest, db: pg.Pool) {
  const jwtUser = getRequestUser(req);
  if (jwtUser) {
    const slug = jwtUser.name?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_") ?? "USER";
    return { id: jwtUser.userId, slug };
  }
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return null;
  const { rows } = await db.query(
    `SELECT id, slug FROM agents WHERE callback_token = $1 LIMIT 1`, [bearer]
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, slug: rows[0].slug ?? rows[0].id.slice(0, 8).toUpperCase() };
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
    Body: { response_note?: string };
  }>(
    "/notifications/:id/process",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { response_note } = req.body ?? {};

      const { rows: [notif] } = await db.query(
        `UPDATE notifications
         SET status = 'processed', processed_at = now(), response_note = COALESCE($1, response_note)
         WHERE notification_id = $2 AND recipient_id = $3
         RETURNING *`,
        [response_note ?? null, req.params.id, caller.id]
      );

      if (!notif) return reply.status(404).send({ ok: false, error: "notification not found or not yours" });
      return { ok: true, notification: notif };
    }
  );
}
