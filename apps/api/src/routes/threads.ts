import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getRequestUser } from "./auth.js";
import { pushToAgent } from "../broadcast.js";

// ── Caller resolution ─────────────────────────────────────────────────────────
// Resolves the calling identity from either JWT cookie (user) or agent
// callback_token (Bearer header). Returns id + display slug, or null.

interface Caller {
  id:   string;
  slug: string;
  type: "user" | "agent";
}

type AttachmentType = "image" | "video" | "audio" | "file";

interface ThreadAttachment {
  type: AttachmentType;
  mime: string;
  size: number;
  url: string;
  filename: string;
  duration?: number | null;
}

const ATTACHMENTS_DIR = join(process.cwd(), "apps", "api", "uploads", "thread-attachments");
mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm", "audio/wav",
  "application/pdf", "text/plain", "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function classifyAttachment(mime: string): AttachmentType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

async function resolveCaller(req: FastifyRequest, db: pg.Pool): Promise<Caller | null> {
  // 1. JWT user session
  const jwtUser = getRequestUser(req);
  if (jwtUser) {
    const slug = jwtUser.name?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_") ?? "USER";
    return { id: jwtUser.userId, slug, type: "user" };
  }

  // 2. Agent callback token
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return null;
  const { rows } = await db.query(
    `SELECT id, slug FROM agents WHERE callback_token = $1 LIMIT 1`,
    [bearer]
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, slug: rows[0].slug ?? rows[0].id.slice(0, 8).toUpperCase(), type: "agent" };
}

// ── Thread access check ───────────────────────────────────────────────────────
// Returns the caller's role in this thread, or null if no access.

type ThreadRole = "creator" | "owner" | "participant" | "removed";

interface ThreadAccess {
  thread: Record<string, unknown>;
  role:   ThreadRole;
}

async function checkThreadAccess(
  threadId: string,
  caller: Caller,
  db: pg.Pool
): Promise<ThreadAccess | null> {
  const { rows: threads } = await db.query(
    `SELECT * FROM threads WHERE thread_id = $1`,
    [threadId]
  );
  if (!threads[0]) return null;
  const thread = threads[0];

  // Creator
  if (thread.created_by === caller.id) return { thread, role: "creator" };

  // User access via project membership (owner or project_users)
  if (caller.type === "user" && thread.project_id) {
    const { rows: projAccess } = await db.query(
      `SELECT 1
       FROM projects p
       LEFT JOIN project_users pu ON pu.project_id = p.id
       WHERE p.id = $1
         AND (p.owner_user_id = $2 OR pu.user_id = $2)
       LIMIT 1`,
      [thread.project_id, caller.id]
    );
    if (projAccess.length) return { thread, role: "owner" };
  }

  // Agent owner — user who owns an agent that is/was a participant
  if (caller.type === "user") {
    const { rows: owned } = await db.query(
      `SELECT 1 FROM thread_participants tp
       JOIN agents a ON a.id = tp.participant_id
       WHERE tp.thread_id = $1 AND a.owner_user_id = $2
       LIMIT 1`,
      [threadId, caller.id]
    );
    if (owned.length) return { thread, role: "owner" };
  }

  // Direct participant (active or removed)
  const { rows: parts } = await db.query(
    `SELECT removed_at FROM thread_participants
     WHERE thread_id = $1 AND participant_id = $2`,
    [threadId, caller.id]
  );
  if (!parts[0]) return null;
  return { thread, role: parts[0].removed_at ? "removed" : "participant" };
}

// ── Fan-out helpers ───────────────────────────────────────────────────────────

async function fanOutNotifications(
  db: pg.Pool,
  messageId: string,
  threadId: string,
  senderId: string,
  priority: string = "normal"
) {
  // All active participants except sender
  const { rows: recipients } = await db.query(
    `SELECT participant_id, participant_slug FROM thread_participants
     WHERE thread_id = $1 AND participant_id != $2 AND removed_at IS NULL`,
    [threadId, senderId]
  );

  for (const r of recipients) {
    const { rows: [notif] } = await db.query(
      `INSERT INTO notifications
         (recipient_id, recipient_slug, message_id, priority)
       VALUES ($1, $2, $3, $4) RETURNING notification_id`,
      [r.participant_id, r.participant_slug, messageId, priority]
    );

    // Real-time push if recipient is an agent connected via WS
    // Enrich with message body/sender so the extension doesn't need a follow-up fetch
    db.query(
      `SELECT tm.body, tm.sender_slug, t.subject
       FROM thread_messages tm
       JOIN threads t ON t.thread_id = tm.thread_id
       WHERE tm.message_id = $1 LIMIT 1`,
      [messageId]
    ).then(({ rows: [msg] }) => {
      pushToAgent(r.participant_id, "notification", {
        notification_id: notif.notification_id,
        message_id:      messageId,
        thread_id:       threadId,
        type:            "a2a_message",
        priority,
        message_body:    msg?.body ?? "",
        message_from:    msg?.sender_slug ?? "",
        thread_subject:  msg?.subject ?? "",
      });
    }).catch(() => {
      // Fallback: push without enrichment
      pushToAgent(r.participant_id, "notification", {
        notification_id: notif.notification_id,
        message_id:      messageId,
        thread_id:       threadId,
        type:            "a2a_message",
        priority,
      });
    });
  }
}

async function insertEventMessage(
  db: pg.Pool,
  threadId: string,
  senderId: string,
  senderSlug: string,
  body: string
) {
  await db.query(
    `INSERT INTO thread_messages (thread_id, sender_id, sender_slug, type, body)
     VALUES ($1, $2, $3, 'event', $4)`,
    [threadId, senderId, senderSlug, body]
  );
  // Event messages do not generate notifications
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function registerThreads(server: FastifyInstance, db: pg.Pool) {

  // ── POST /api/v1/threads — create thread ───────────────────────────────────
  server.post<{ Body: { subject: string; participants?: string[]; project_id: string } }>(
    "/threads",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { subject, participants = [], project_id } = req.body ?? {};
      if (!subject?.trim()) return reply.status(400).send({ ok: false, error: "subject is required" });
      if (!project_id?.trim()) return reply.status(400).send({ ok: false, error: "project_id is required" });

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        // Create thread
        const { rows: [thread] } = await client.query(
          `INSERT INTO threads (subject, project_id, created_by, created_slug)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [subject.trim(), project_id ?? null, caller.id, caller.slug]
        );

        // Auto-add creator as participant
        await client.query(
          `INSERT INTO thread_participants
             (thread_id, participant_id, participant_slug, added_by, added_by_slug)
           VALUES ($1, $2, $3, $4, $5)`,
          [thread.thread_id, caller.id, caller.slug, caller.id, caller.slug]
        );

        // Add initial participants
        for (const pid of participants) {
          if (pid === caller.id) continue;
          const { rows: [resolved] } = await client.query(
            `SELECT id, COALESCE(slug, name) AS slug FROM agents WHERE id::text = $1
             UNION ALL
             SELECT id, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g')) FROM users WHERE id::text = $1
             LIMIT 1`,
            [pid]
          );
          if (!resolved) continue;
          await client.query(
            `INSERT INTO thread_participants
               (thread_id, participant_id, participant_slug, added_by, added_by_slug)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (thread_id, participant_id) DO NOTHING`,
            [thread.thread_id, resolved.id, resolved.slug, caller.id, caller.slug]
          );
        }

        await client.query("COMMIT");
        return { ok: true, thread_id: thread.thread_id, thread };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // ── POST /threads/direct — one-call A2A send ─────────────────────────────
  // Finds or creates a direct thread between caller and `to`, then posts body.
  // Replaces the old POST /a2a/send flow.
  server.post<{ Body: { to: string; body: string; subject?: string; priority?: string; project_id: string } }>(
    "/threads/direct",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { to, body, subject, priority = "normal", project_id } = req.body ?? {};
      if (!to?.trim())         return reply.status(400).send({ ok: false, error: "to (recipient id) is required" });
      if (!body?.trim())       return reply.status(400).send({ ok: false, error: "body is required" });
      if (!project_id?.trim()) return reply.status(400).send({ ok: false, error: "project_id is required" });

      // Resolve recipient
      const { rows: [recipient] } = await db.query(
        `SELECT id, COALESCE(slug, upper(regexp_replace(name,'[^A-Za-z0-9]','_','g'))) AS slug
         FROM agents WHERE id::text = $1
         UNION ALL
         SELECT id, upper(regexp_replace(name,'[^A-Za-z0-9]','_','g'))
         FROM users WHERE id::text = $1
         LIMIT 1`,
        [to]
      );
      if (!recipient) return reply.status(404).send({ ok: false, error: "recipient not found" });

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        // Find existing direct thread between caller and recipient within the same project
        const { rows: [existing] } = await client.query(
          `SELECT t.thread_id FROM threads t
           JOIN thread_participants pa ON pa.thread_id = t.thread_id AND pa.participant_id = $1 AND pa.removed_at IS NULL
           JOIN thread_participants pb ON pb.thread_id = t.thread_id AND pb.participant_id = $2 AND pb.removed_at IS NULL
           WHERE t.deleted_at IS NULL AND t.project_id = $3 AND t.status = 'open'
           ORDER BY t.created_at DESC LIMIT 1`,
          [caller.id, recipient.id, project_id]
        );

        let thread_id: string;

        if (existing) {
          thread_id = existing.thread_id;
        } else {
          // Create new direct thread
          const autoSubject = subject?.trim() || `${caller.slug} ↔ ${recipient.slug}`;
          const { rows: [thread] } = await client.query(
            `INSERT INTO threads (subject, project_id, created_by, created_slug)
             VALUES ($1, $2, $3, $4) RETURNING thread_id`,
            [autoSubject, project_id, caller.id, caller.slug]
          );
          thread_id = thread.thread_id;

          // Add both as participants
          for (const p of [{ id: caller.id, slug: caller.slug }, { id: recipient.id, slug: recipient.slug }]) {
            await client.query(
              `INSERT INTO thread_participants (thread_id, participant_id, participant_slug, added_by, added_by_slug)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT (thread_id, participant_id) DO NOTHING`,
              [thread_id, p.id, p.slug, caller.id, caller.slug]
            );
          }
        }

        // Send message
        const { rows: [message] } = await client.query(
          `INSERT INTO thread_messages (thread_id, sender_id, sender_slug, type, body)
           VALUES ($1, $2, $3, 'message', $4) RETURNING *`,
          [thread_id, caller.id, caller.slug, body.trim()]
        );

        // Create notification for recipient
        const { rows: [notif] } = await client.query(
          `INSERT INTO notifications (recipient_id, recipient_slug, message_id, priority, status)
           VALUES ($1, $2, $3, $4, 'pending') RETURNING notification_id`,
          [recipient.id, recipient.slug, message.message_id, priority]
        );

        await client.query("COMMIT");

        // Push real-time notification
        pushToAgent(recipient.id, "notification", {
          notification_id: notif.notification_id,
          thread_id,
          message_id:  message.message_id,
          from:        caller.slug,
          priority,
          body:        body.trim().slice(0, 100),
        });

        return { ok: true, thread_id, message_id: message.message_id, notification_id: notif.notification_id };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // ── GET /threads — list threads ─────────────────────────────────────────
  server.get<{ Querystring: { search?: string; limit?: string; offset?: string; include_deleted?: string; project_id?: string; status?: string } }>(
    "/threads",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { search, limit = "10", offset = "0", include_deleted, project_id, status = "open" } = req.query;
      const lim = Math.min(Number(limit), 100);
      const off = Number(offset);
      const showDeleted = include_deleted === "true";
      const pid = project_id?.trim() || null;
      // status filter: "open" | "closed" | "archived" | "all"
      const statusFilter = ["open", "closed", "archived"].includes(status) ? status : null;

      let query: string;
      let params: unknown[];

      // Shared visibility CTE: user sees a thread if:
      // 1. Direct participant
      // 2. Owns an agent that is a participant
      // 3. Is owner/member of the thread's project
      const visibilityCte = `
        WITH visible AS (
          SELECT DISTINCT t.thread_id
          FROM threads t
          LEFT JOIN thread_participants tp_self
            ON tp_self.thread_id = t.thread_id AND tp_self.participant_id = $1
          WHERE
            tp_self.participant_id IS NOT NULL
            OR (
              $2 = true AND EXISTS (
                SELECT 1 FROM thread_participants tp2
                JOIN agents a ON a.id = tp2.participant_id
                WHERE tp2.thread_id = t.thread_id AND a.owner_user_id = $1
              )
            )
            OR (
              $2 = true AND t.project_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM projects p
                LEFT JOIN project_users pu ON pu.project_id = p.id
                WHERE p.id = t.project_id AND (p.owner_user_id = $1 OR pu.user_id = $1)
              )
            )
        )`;

      if (search?.trim()) {
        query = `${visibilityCte}
          SELECT DISTINCT t.*, tp_self.removed_at AS my_removed_at
          FROM threads t
          JOIN visible v ON v.thread_id = t.thread_id
          LEFT JOIN thread_participants tp_self
            ON tp_self.thread_id = t.thread_id AND tp_self.participant_id = $1
          LEFT JOIN thread_messages tm ON tm.thread_id = t.thread_id
          WHERE
            ($3 = false OR t.deleted_at IS NULL)
            AND ($4::uuid IS NULL OR t.project_id = $4)
            AND ($5::text IS NULL OR t.status = $5)
            AND (
              to_tsvector('english', t.subject) @@ plainto_tsquery('english', $6)
              OR to_tsvector('english', COALESCE(tm.body, '')) @@ plainto_tsquery('english', $6)
            )
          ORDER BY t.created_at DESC
          LIMIT $7 OFFSET $8`;
        params = [caller.id, caller.type === "user", !showDeleted, pid, statusFilter, search.trim(), lim, off];
      } else {
        query = `${visibilityCte}
          SELECT t.*, tp_self.removed_at AS my_removed_at
          FROM threads t
          JOIN visible v ON v.thread_id = t.thread_id
          LEFT JOIN thread_participants tp_self
            ON tp_self.thread_id = t.thread_id AND tp_self.participant_id = $1
          WHERE
            ($3 = false OR t.deleted_at IS NULL)
            AND ($4::uuid IS NULL OR t.project_id = $4)
            AND ($5::text IS NULL OR t.status = $5)
          ORDER BY t.created_at DESC
          LIMIT $6 OFFSET $7`;
        params = [caller.id, caller.type === "user", !showDeleted, pid, statusFilter, lim, off];
      }

      const { rows } = await db.query(query, params);
      return { ok: true, threads: rows, limit: lim, offset: off };
    }
  );

  // ── GET /api/v1/threads/:thread_id — get thread ────────────────────────────
  server.get<{ Params: { thread_id: string } }>(
    "/threads/:thread_id",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found or no access" });

      const { rows: participants } = await db.query(
        `SELECT * FROM thread_participants WHERE thread_id = $1 ORDER BY joined_at ASC`,
        [req.params.thread_id]
      );

      return { ok: true, thread: access.thread, participants, role: access.role };
    }
  );

  // ── DELETE /api/v1/threads/:thread_id — soft delete ────────────────────────
  server.delete<{ Params: { thread_id: string } }>(
    "/threads/:thread_id",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });
      if (access.role !== "creator" && access.role !== "owner") {
        return reply.status(403).send({ ok: false, error: "only the thread creator or agent owner can delete" });
      }

      await db.query(
        `UPDATE threads SET deleted_at = now() WHERE thread_id = $1`,
        [req.params.thread_id]
      );
      return { ok: true };
    }
  );

  // ── PATCH /api/v1/threads/:thread_id/status ────────────────────────────────
  server.patch<{ Params: { thread_id: string }; Body: { status: string } }>(
    "/threads/:thread_id/status",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { status } = req.body ?? {};
      if (!["open", "closed", "archived"].includes(status)) {
        return reply.status(400).send({ ok: false, error: "status must be open, closed, or archived" });
      }

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });
      if (access.role !== "creator" && access.role !== "owner") {
        return reply.status(403).send({ ok: false, error: "only the thread creator or owner can change status" });
      }

      await db.query(
        `UPDATE threads SET status = $1 WHERE thread_id = $2`,
        [status, req.params.thread_id]
      );
      return { ok: true, status };
    }
  );

  // ── GET /api/v1/threads/:thread_id/participants ─────────────────────────────
  server.get<{ Params: { thread_id: string } }>(
    "/threads/:thread_id/participants",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found or no access" });

      const { rows } = await db.query(
        `SELECT * FROM thread_participants WHERE thread_id = $1 ORDER BY joined_at ASC`,
        [req.params.thread_id]
      );
      return { ok: true, participants: rows };
    }
  );

  // ── POST /api/v1/threads/:thread_id/participants — add ─────────────────────
  server.post<{ Params: { thread_id: string }; Body: { participant_id: string } }>(
    "/threads/:thread_id/participants",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });
      if (access.role !== "creator" && access.role !== "owner") {
        return reply.status(403).send({ ok: false, error: "only the thread creator or agent owner can add participants" });
      }

      const { participant_id } = req.body ?? {};
      if (!participant_id) return reply.status(400).send({ ok: false, error: "participant_id required" });

      // Resolve slug
      const { rows: [resolved] } = await db.query(
        `SELECT id, COALESCE(slug, name) AS slug FROM agents WHERE id::text = $1
         UNION ALL
         SELECT id, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g')) FROM users WHERE id::text = $1
         LIMIT 1`,
        [participant_id]
      );
      if (!resolved) return reply.status(404).send({ ok: false, error: "participant not found" });

      // Upsert — handles re-adding removed participants
      await db.query(
        `INSERT INTO thread_participants
           (thread_id, participant_id, participant_slug, added_by, added_by_slug, joined_at, removed_at)
         VALUES ($1, $2, $3, $4, $5, now(), null)
         ON CONFLICT (thread_id, participant_id)
         DO UPDATE SET removed_at = null, joined_at = now(),
                       added_by = $4, added_by_slug = $5`,
        [req.params.thread_id, resolved.id, resolved.slug, caller.id, caller.slug]
      );

      // Auto event message
      await insertEventMessage(db, req.params.thread_id, caller.id, caller.slug,
        `${resolved.slug} was added by ${caller.slug}`);

      return { ok: true, participant_id: resolved.id, participant_slug: resolved.slug };
    }
  );

  // ── DELETE /api/v1/threads/:thread_id/participants/:pid — remove ───────────
  server.delete<{ Params: { thread_id: string; pid: string } }>(
    "/threads/:thread_id/participants/:pid",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });
      if (access.role !== "creator" && access.role !== "owner") {
        return reply.status(403).send({ ok: false, error: "only the thread creator or agent owner can remove participants" });
      }

      const { rows: [part] } = await db.query(
        `SELECT participant_slug FROM thread_participants
         WHERE thread_id = $1 AND participant_id = $2`,
        [req.params.thread_id, req.params.pid]
      );
      if (!part) return reply.status(404).send({ ok: false, error: "participant not found" });

      await db.query(
        `UPDATE thread_participants SET removed_at = now()
         WHERE thread_id = $1 AND participant_id = $2`,
        [req.params.thread_id, req.params.pid]
      );

      // Auto event message
      await insertEventMessage(db, req.params.thread_id, caller.id, caller.slug,
        `${part.participant_slug} was removed by ${caller.slug}`);

      return { ok: true };
    }
  );

  // ── POST /api/v1/threads/:thread_id/attachments/upload ───────────────────
  server.post<{ Params: { thread_id: string } }>(
    "/threads/:thread_id/attachments/upload",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found or no access" });
      if (access.role === "removed") return reply.status(403).send({ ok: false, error: "removed participants cannot upload" });

      const part = await (req as any).file();
      if (!part) return reply.status(400).send({ ok: false, error: "file is required" });

      const mime = String(part.mimetype || "application/octet-stream");
      const filename = String(part.filename || "attachment");
      if (!ALLOWED_MIME.has(mime)) {
        return reply.status(400).send({ ok: false, error: `unsupported mime type: ${mime}` });
      }

      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of part.file) {
        total += chunk.length;
        if (total > 10 * 1024 * 1024) {
          return reply.status(413).send({ ok: false, error: "attachment too large (max 10MB)" });
        }
        chunks.push(chunk);
      }

      const safeBase = filename.replace(/[^A-Za-z0-9._-]/g, "_");
      const storageName = `${Date.now()}_${randomUUID()}_${safeBase}`;
      const outPath = join(ATTACHMENTS_DIR, storageName);
      writeFileSync(outPath, Buffer.concat(chunks));

      const attachment: ThreadAttachment = {
        type: classifyAttachment(mime),
        mime,
        size: total,
        url: `/uploads/thread-attachments/${storageName}`,
        filename,
      };

      return { ok: true, attachment };
    }
  );

  // ── POST /api/v1/threads/:thread_id/messages — send message ───────────────
  server.post<{
    Params: { thread_id: string };
    Body: { body?: string; reply_to?: string; priority?: string; attachments?: ThreadAttachment[] };
  }>(
    "/threads/:thread_id/messages",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found or no access" });
      if (access.role === "removed") {
        return reply.status(403).send({ ok: false, error: "removed participants cannot send messages" });
      }
      if ((access.thread as any).deleted_at) {
        return reply.status(410).send({ ok: false, error: "thread has been deleted" });
      }

      const { body = "", reply_to, priority = "normal", attachments = [] } = req.body ?? {};
      const cleanBody = body.trim();
      const safeAttachments = Array.isArray(attachments) ? attachments.filter(Boolean).slice(0, 8) : [];

      for (const a of safeAttachments) {
        if (!a || typeof a !== "object" || typeof a.url !== "string") {
          return reply.status(400).send({ ok: false, error: "invalid attachments payload" });
        }
      }

      if (!cleanBody && safeAttachments.length === 0) {
        return reply.status(400).send({ ok: false, error: "body or attachments required" });
      }

      // Validate reply_to belongs to same thread
      if (reply_to) {
        const { rows: [parent] } = await db.query(
          `SELECT message_id FROM thread_messages WHERE message_id = $1 AND thread_id = $2`,
          [reply_to, req.params.thread_id]
        );
        if (!parent) return reply.status(400).send({ ok: false, error: "reply_to message not in this thread" });
      }

      const { rows: [msg] } = await db.query(
        `INSERT INTO thread_messages (thread_id, reply_to, sender_id, sender_slug, body, attachments)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *`,
        [req.params.thread_id, reply_to ?? null, caller.id, caller.slug, cleanBody, JSON.stringify(safeAttachments)]
      );

      // Fan out notifications to all active participants except sender
      await fanOutNotifications(db, msg.message_id, req.params.thread_id, caller.id, priority);

      return { ok: true, message_id: msg.message_id, message: msg };
    }
  );

  // ── GET /api/v1/threads/:thread_id/messages — list messages ───────────────
  server.get<{
    Params: { thread_id: string };
    Querystring: { limit?: string; before?: string; types?: string };
  }>(
    "/threads/:thread_id/messages",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found or no access" });

      const lim = Math.min(Number(req.query.limit ?? 50), 200);
      const before = req.query.before; // ISO timestamp
      const types = req.query.types?.split(",") ?? ["message", "event"];

      const { rows } = await db.query(
        `SELECT * FROM thread_messages
         WHERE thread_id = $1
           AND type = ANY($2)
           AND ($3::timestamptz IS NULL OR sent_at < $3)
         ORDER BY sent_at ASC
         LIMIT $4`,
        [req.params.thread_id, types, before ?? null, lim]
      );

      return { ok: true, messages: rows, count: rows.length };
    }
  );

  // ── GET /api/v1/threads/:thread_id/messages/:message_id ───────────────────
  server.get<{ Params: { thread_id: string; message_id: string } }>(
    "/threads/:thread_id/messages/:message_id",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found or no access" });

      const { rows: [msg] } = await db.query(
        `SELECT * FROM thread_messages WHERE message_id = $1 AND thread_id = $2`,
        [req.params.message_id, req.params.thread_id]
      );
      if (!msg) return reply.status(404).send({ ok: false, error: "message not found" });

      // Mark as read — set read_at on the caller's notification for this message
      await db.query(
        `UPDATE notifications
         SET status = 'read', read_at = now()
         WHERE message_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
        [req.params.message_id, caller.id]
      );

      return { ok: true, message: msg };
    }
  );

  // ── GET receipts ───────────────────────────────────────────────────────────
  server.get<{ Params: { thread_id: string; message_id: string } }>(
    "/threads/:thread_id/messages/:message_id/receipts",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found or no access" });

      const { rows } = await db.query(
        `SELECT recipient_id, recipient_slug, status,
                delivered_at, read_at, processed_at, expires_at
         FROM notifications
         WHERE message_id = $1
         ORDER BY recipient_slug ASC`,
        [req.params.message_id]
      );

      return { ok: true, message_id: req.params.message_id, receipts: rows };
    }
  );
}
