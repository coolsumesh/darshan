import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getRequestUser } from "./auth.js";
import { broadcast, pushToAgent } from "../broadcast.js";
import {
  TASK_PICKUP_SLA_MINUTES,
  TASK_PROGRESS_SLA_MINUTES,
  syncTaskSlaJobs,
  type TaskSlaStateRow,
} from "../workers/taskSlaQueue.js";

// ── Caller resolution ─────────────────────────────────────────────────────────
// Resolves the calling identity from either JWT cookie (user) or agent
// callback_token (Bearer header). Returns id + display slug, or null.

interface Caller {
  id:   string;
  slug: string;
  type: "user" | "agent";
}

type DbExecutor = Pick<pg.Pool, "query">;

type AttachmentType = "image" | "video" | "audio" | "file";

interface ThreadAttachment {
  type: AttachmentType;
  mime: string;
  size: number;
  url: string;
  filename: string;
  duration?: number | null;
}

const THREAD_TYPES = new Set(["conversation", "feature", "level_test", "task"]);
const THREAD_STATUSES = new Set(["open", "closed", "archived"]);
const TASK_STATUSES = new Set(["proposed", "approved", "in-progress", "review", "blocked"]);
const TASK_PRIORITIES = new Set(["high", "medium", "normal", "low"]);
const MESSAGE_INTENTS = new Set([
  "greeting",
  "question",
  "answer",
  "suggest",
  "work_confirmation",
  "status_update",
  "review_request",
  "blocked",
  "closure",
]);
const TARGETED_REPLY_MESSAGE_INTENTS = new Set(["answer", "review_request", "blocked"]);
const AWAITING_ON_VALUES = new Set(["user", "agent", "none"]);
const ACTIVE_RESPONDERS_MAX_NEXT = Math.max(1, Number(process.env.ACTIVE_RESPONDERS_MAX_NEXT ?? 100));

type ReplyPolicyMode = "all" | "restricted";

type ThreadReplyPolicyRow = {
  thread_id: string;
  mode: ReplyPolicyMode;
  allowed_participant_ids: string[];
  next_message_limit: number | null;
  expires_at: string | null;
  updated_by: string | null;
  updated_at: string;
};

type HydratedReplyPolicy = ThreadReplyPolicyRow & {
  allowed_participants: Array<{ participant_id: string; participant_slug: string }>;
};

type NextReplyMode = "any" | "all";

type ThreadNextReplyRow = {
  thread_id: string;
  mode: NextReplyMode;
  pending_participant_ids: string[];
  reason: string | null;
  set_by: string | null;
  set_at: string;
  expires_at: string | null;
  cleared_at: string | null;
};

type HydratedThreadNextReply = ThreadNextReplyRow & {
  pending_participants: Array<{ participant_id: string; participant_slug: string }>;
  pending_participant_slugs: string[];
  is_expired: boolean;
};

type ActiveRespondersCommand =
  | { action: "clear" | "status" }
  | { action: "set"; slugs: string[]; nextMessageLimit: number | null };

type TaskLifecycleEvent =
  | "task.approved"
  | "task.in_progress"
  | "task.progress"
  | "task.blocked"
  | "task.review_requested"
  | "task.done";

type TaskSlaState = {
  thread_id: string;
  pickup_due_at: string | null;
  progress_due_at: string | null;
  last_progress_at: string | null;
  last_event_type: string | null;
  last_event_at: string | null;
  stale_reason: string | null;
};

function normalizeSlug(value: string | null | undefined, fallback = "SYSTEM") {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "_") || fallback;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function normalizePriority(value: unknown): "high" | "medium" | "normal" | "low" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return TASK_PRIORITIES.has(normalized) ? (normalized as "high" | "medium" | "normal" | "low") : null;
}

function mapTaskEventForStatus(previousStatus: string | null, nextStatus: string | undefined) {
  if (!nextStatus || previousStatus === nextStatus) return null;
  switch (nextStatus) {
    case "approved":
      return "task.approved" as const;
    case "in-progress":
      return previousStatus === "in-progress" ? "task.progress" as const : "task.in_progress" as const;
    case "review":
      return "task.review_requested" as const;
    case "blocked":
      return "task.blocked" as const;
    default:
      return null;
  }
}

function describeTaskLifecycleEvent(eventType: TaskLifecycleEvent, actorSlug: string) {
  switch (eventType) {
    case "task.approved":
      return `${actorSlug} approved the task`;
    case "task.in_progress":
      return `${actorSlug} started work`;
    case "task.progress":
      return `${actorSlug} posted progress`;
    case "task.blocked":
      return `${actorSlug} marked the task blocked`;
    case "task.review_requested":
      return `${actorSlug} requested review`;
    case "task.done":
      return `${actorSlug} marked the task done`;
    default:
      return `${actorSlug} updated the task`;
  }
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
    const slug = normalizeSlug(jwtUser.name, "USER");
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

async function resolveIdentityById(db: DbExecutor, id: string) {
  const { rows } = await db.query(
    `SELECT id, COALESCE(slug, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g'))) AS slug, 'agent' AS kind
     FROM agents WHERE id::text = $1
     UNION ALL
     SELECT id, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g')) AS slug, 'user' AS kind
     FROM users WHERE id::text = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] as { id: string; slug: string; kind: "agent" | "user" } | undefined;
}

async function ensureParticipant(
  db: DbExecutor,
  threadId: string,
  participantId: string,
  participantSlug: string,
  addedBy: string,
  addedBySlug: string
) {
  await db.query(
    `INSERT INTO thread_participants
       (thread_id, participant_id, participant_slug, added_by, added_by_slug, joined_at, removed_at)
     VALUES ($1, $2, $3, $4, $5, now(), null)
     ON CONFLICT (thread_id, participant_id)
     DO UPDATE SET participant_slug = excluded.participant_slug,
                   added_by = excluded.added_by,
                   added_by_slug = excluded.added_by_slug,
                   joined_at = now(),
                   removed_at = null`,
    [threadId, participantId, participantSlug, addedBy, addedBySlug]
  );
}

async function upsertDescriptionMessage(
  db: DbExecutor,
  threadId: string,
  senderId: string,
  senderSlug: string,
  description: string
) {
  const { rows } = await db.query(
    `SELECT message_id
     FROM thread_messages
     WHERE thread_id = $1 AND type = 'message'
     ORDER BY sent_at ASC
     LIMIT 1`,
    [threadId]
  );

  if (rows[0]) {
    await db.query(`UPDATE thread_messages SET body = $1 WHERE message_id = $2`, [description, rows[0].message_id]);
    return;
  }

  await db.query(
    `INSERT INTO thread_messages (thread_id, sender_id, sender_slug, type, body, intent, awaiting_on)
     VALUES ($1, $2, $3, 'message', $4, 'status_update', 'none')`,
    [threadId, senderId, senderSlug, description]
  );
}

async function canCloseTaskThread(threadId: string, caller: Caller, db: DbExecutor) {
  const { rows: threads } = await db.query(
    `SELECT thread_id, project_id FROM threads WHERE thread_id = $1 LIMIT 1`,
    [threadId]
  );
  if (!threads[0]?.project_id) return false;

  if (caller.type === "user") {
    const { rows } = await db.query(
      `SELECT 1 FROM projects WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
      [threads[0].project_id, caller.id]
    );
    return !!rows[0];
  }

  const { rows } = await db.query(
    `SELECT 1
     FROM project_agent_roles
     WHERE project_id = $1 AND agent_id = $2 AND agent_role = 'coordinator'
     LIMIT 1`,
    [threads[0].project_id, caller.id]
  );
  return !!rows[0];
}

async function isThreadCoordinator(thread: Record<string, unknown>, caller: Caller, db: DbExecutor) {
  if (caller.type !== "agent" || !thread.project_id) return false;
  const { rows } = await db.query(
    `SELECT 1
     FROM project_agent_roles
     WHERE project_id = $1 AND agent_id = $2 AND agent_role = 'coordinator'
     LIMIT 1`,
    [thread.project_id, caller.id]
  );
  return !!rows[0];
}

async function loadThreadNextReply(db: DbExecutor, threadId: string): Promise<HydratedThreadNextReply | null> {
  const { rows } = await db.query(
    `SELECT *
     FROM thread_next_reply
     WHERE thread_id = $1
       AND cleared_at IS NULL
     LIMIT 1`,
    [threadId]
  );
  const nextReply = rows[0] as ThreadNextReplyRow | undefined;
  if (!nextReply) return null;

  const participantIds = Array.isArray(nextReply.pending_participant_ids) ? nextReply.pending_participant_ids : [];
  const { rows: pendingParticipants } = participantIds.length === 0
    ? { rows: [] as Array<{ participant_id: string; participant_slug: string }> }
    : await db.query(
        `SELECT participant_id, participant_slug
         FROM thread_participants
         WHERE thread_id = $1
           AND participant_id = ANY($2::uuid[])
           AND removed_at IS NULL
         ORDER BY participant_slug ASC`,
        [threadId, participantIds]
      );

  return {
    ...nextReply,
    pending_participants: pendingParticipants,
    pending_participant_slugs: pendingParticipants.map((participant: { participant_slug: string }) => participant.participant_slug),
    is_expired: !!nextReply.expires_at && new Date(nextReply.expires_at).getTime() <= Date.now(),
  };
}

async function setThreadHasReplyPending(db: DbExecutor, threadId: string, hasReplyPending: boolean) {
  await db.query(
    `UPDATE threads
     SET has_reply_pending = $2
     WHERE thread_id = $1`,
    [threadId, hasReplyPending]
  );
}

async function clearThreadNextReply(db: DbExecutor, threadId: string) {
  await db.query(
    `UPDATE thread_next_reply
     SET cleared_at = now()
     WHERE thread_id = $1
       AND cleared_at IS NULL`,
    [threadId]
  );
  await setThreadHasReplyPending(db, threadId, false);
}

async function upsertThreadNextReply(
  db: DbExecutor,
  threadId: string,
  setBy: string,
  mode: NextReplyMode,
  pendingParticipantIds: string[],
  reason: string | null,
  expiresAt: string | null
) {
  await db.query(
    `INSERT INTO thread_next_reply (
       thread_id, mode, pending_participant_ids, reason, set_by, set_at, expires_at, cleared_at
     )
     VALUES ($1, $2, $3::uuid[], $4, $5, now(), $6, null)
     ON CONFLICT (thread_id)
     DO UPDATE SET mode = excluded.mode,
                   pending_participant_ids = excluded.pending_participant_ids,
                   reason = excluded.reason,
                   set_by = excluded.set_by,
                   set_at = now(),
                   expires_at = excluded.expires_at,
                   cleared_at = null`,
    [threadId, mode, pendingParticipantIds, reason, setBy, expiresAt]
  );
  await setThreadHasReplyPending(db, threadId, pendingParticipantIds.length > 0);
}

async function resolveThreadNextReplyOnMessage(db: DbExecutor, threadId: string, senderId: string) {
  const nextReply = await loadThreadNextReply(db, threadId);
  if (!nextReply) return null;
  if (!nextReply.pending_participant_ids.includes(senderId)) return nextReply;

  if (nextReply.mode === "any") {
    await clearThreadNextReply(db, threadId);
    return null;
  }

  const remainingParticipantIds = nextReply.pending_participant_ids.filter((participantId) => participantId !== senderId);
  if (remainingParticipantIds.length === 0) {
    await clearThreadNextReply(db, threadId);
    return null;
  }

  await db.query(
    `UPDATE thread_next_reply
     SET pending_participant_ids = $2::uuid[]
     WHERE thread_id = $1
       AND cleared_at IS NULL`,
    [threadId, remainingParticipantIds]
  );
  await setThreadHasReplyPending(db, threadId, true);
  return loadThreadNextReply(db, threadId);
}

async function removeParticipantFromNextReply(db: DbExecutor, threadId: string, participantId: string) {
  const nextReply = await loadThreadNextReply(db, threadId);
  if (!nextReply || !nextReply.pending_participant_ids.includes(participantId)) return;

  const remainingParticipantIds = nextReply.pending_participant_ids.filter((id) => id !== participantId);
  if (remainingParticipantIds.length === 0) {
    await clearThreadNextReply(db, threadId);
    return;
  }

  await db.query(
    `UPDATE thread_next_reply
     SET pending_participant_ids = $2::uuid[]
     WHERE thread_id = $1
       AND cleared_at IS NULL`,
    [threadId, remainingParticipantIds]
  );
}

async function loadReplyPolicy(db: DbExecutor, threadId: string): Promise<HydratedReplyPolicy | null> {
  const { rows } = await db.query(
    `SELECT *
     FROM thread_reply_policy
     WHERE thread_id = $1
     LIMIT 1`,
    [threadId]
  );
  const policy = rows[0] as ThreadReplyPolicyRow | undefined;
  if (!policy) return null;

  if (policy.mode === "restricted" && policy.expires_at && new Date(policy.expires_at).getTime() <= Date.now()) {
    await db.query(
      `UPDATE thread_reply_policy
       SET mode = 'all',
           allowed_participant_ids = '{}',
           next_message_limit = null,
           expires_at = null,
           updated_at = now()
       WHERE thread_id = $1`,
      [threadId]
    );
    return null;
  }

  const participantIds = Array.isArray(policy.allowed_participant_ids) ? policy.allowed_participant_ids : [];
  const { rows: allowedParticipants } = participantIds.length === 0
    ? { rows: [] as Array<{ participant_id: string; participant_slug: string }> }
    : await db.query(
        `SELECT participant_id, participant_slug
         FROM thread_participants
         WHERE thread_id = $1
           AND participant_id = ANY($2::uuid[])
           AND removed_at IS NULL
         ORDER BY participant_slug ASC`,
        [threadId, participantIds]
      );

  return {
    ...policy,
    allowed_participants: allowedParticipants,
  };
}

async function writeReplyPolicy(
  db: DbExecutor,
  threadId: string,
  updatedBy: string,
  mode: ReplyPolicyMode,
  allowedParticipantIds: string[],
  nextMessageLimit: number | null
) {
  await db.query(
    `INSERT INTO thread_reply_policy (
       thread_id, mode, allowed_participant_ids, next_message_limit, expires_at, updated_by, updated_at
     )
     VALUES ($1, $2, $3::uuid[], $4, null, $5, now())
     ON CONFLICT (thread_id)
     DO UPDATE SET mode = excluded.mode,
                   allowed_participant_ids = excluded.allowed_participant_ids,
                   next_message_limit = excluded.next_message_limit,
                   expires_at = excluded.expires_at,
                   updated_by = excluded.updated_by,
                   updated_at = now()`,
    [threadId, mode, allowedParticipantIds, nextMessageLimit, updatedBy]
  );
}

async function decrementReplyPolicyWindow(db: DbExecutor, threadId: string) {
  const { rows } = await db.query(
    `UPDATE thread_reply_policy
     SET next_message_limit = next_message_limit - 1,
         updated_at = now()
     WHERE thread_id = $1
       AND mode = 'restricted'
       AND next_message_limit IS NOT NULL
       AND next_message_limit > 0
     RETURNING next_message_limit`,
    [threadId]
  );
  if (!rows[0]) return;
  if (rows[0].next_message_limit <= 0) {
    await db.query(
      `UPDATE thread_reply_policy
       SET mode = 'all',
           allowed_participant_ids = '{}',
           next_message_limit = null,
           expires_at = null,
           updated_at = now()
       WHERE thread_id = $1`,
      [threadId]
    );
  }
}

async function upsertTaskSlaState(
  db: pg.Pool,
  threadId: string,
  eventType: TaskLifecycleEvent,
  occurredAt = new Date()
) {
  const nowIso = occurredAt.toISOString();
  let pickupDueAt: string | null = null;
  let progressDueAt: string | null = null;
  let lastProgressAt: string | null = null;
  let staleReason: string | null = null;

  switch (eventType) {
    case "task.approved":
      pickupDueAt = addMinutes(occurredAt, TASK_PICKUP_SLA_MINUTES);
      break;
    case "task.in_progress":
      progressDueAt = addMinutes(occurredAt, TASK_PROGRESS_SLA_MINUTES);
      lastProgressAt = nowIso;
      break;
    case "task.progress":
      progressDueAt = addMinutes(occurredAt, TASK_PROGRESS_SLA_MINUTES);
      lastProgressAt = nowIso;
      break;
    case "task.blocked":
    case "task.review_requested":
    case "task.done":
      staleReason = null;
      break;
  }

  const { rows } = await db.query(
    `INSERT INTO task_sla_state (
       thread_id, pickup_due_at, progress_due_at, last_progress_at, last_event_type, last_event_at, stale_reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, null)
     ON CONFLICT (thread_id)
     DO UPDATE SET pickup_due_at = excluded.pickup_due_at,
                   progress_due_at = excluded.progress_due_at,
                   last_progress_at = COALESCE(excluded.last_progress_at, task_sla_state.last_progress_at),
                   last_event_type = excluded.last_event_type,
                   last_event_at = excluded.last_event_at,
                   stale_reason = $7
     RETURNING thread_id, pickup_due_at, progress_due_at`,
    [threadId, pickupDueAt, progressDueAt, lastProgressAt, eventType, nowIso, staleReason]
  );

  await syncTaskSlaJobs(rows[0] as TaskSlaStateRow);
}

async function closeTaskThread(threadId: string, caller: Caller, db: DbExecutor) {
  const doneByUserId = caller.type === "user" ? caller.id : null;
  const doneByAgentId = caller.type === "agent" ? caller.id : null;

  const { rows } = await db.query(
    `UPDATE threads
     SET status = 'closed',
         task_status = null,
         done_at = now(),
         done_by_user_id = $2,
         done_by_agent_id = $3
     WHERE thread_id = $1
     RETURNING *`,
    [threadId, doneByUserId, doneByAgentId]
  );
  return rows[0];
}

async function hydrateThread(db: DbExecutor, threadId: string) {
  const { rows } = await db.query(
    `SELECT
       t.*,
       COALESCE(assignee_agent.name, assignee_user.name) AS assignee_name,
       first_message.body AS description
     FROM threads t
     LEFT JOIN agents assignee_agent ON assignee_agent.id = t.assignee_agent_id
     LEFT JOIN users assignee_user ON assignee_user.id = t.assignee_user_id
     LEFT JOIN LATERAL (
       SELECT body
       FROM thread_messages
       WHERE thread_id = t.thread_id AND type = 'message'
       ORDER BY sent_at ASC
       LIMIT 1
     ) first_message ON true
     WHERE t.thread_id = $1
     LIMIT 1`,
    [threadId]
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    next_reply: await loadThreadNextReply(db, threadId),
  };
}

async function buildThreadFlow(db: DbExecutor, threadId: string) {
  const { rows: [thread] } = await db.query(
    `SELECT thread_id, created_at, created_slug
     FROM threads
     WHERE thread_id = $1
     LIMIT 1`,
    [threadId]
  );
  if (!thread) return { path: [] as Array<Record<string, unknown>>, awaiting_on: null as string | null, next_expected_from: null as string | null };

  const { rows: messages } = await db.query(
    `SELECT message_id, sender_slug, sent_at, type, intent, awaiting_on, next_expected_from
     FROM thread_messages
     WHERE thread_id = $1
     ORDER BY sent_at ASC, message_id ASC`,
    [threadId]
  );

  const path: Array<Record<string, unknown>> = [
    {
      seq: 1,
      event_type: "created",
      from_actor: "SYSTEM",
      to_actor: thread.created_slug,
      message_id: null,
      created_at: thread.created_at,
      awaiting_on: "none",
      next_expected_from: thread.created_slug,
    },
  ];

  let lastAwaitingOn: string | null = null;
  let lastNextExpectedFrom: string | null = null;
  for (const [index, message] of messages.entries()) {
    const eventType = (message.intent as string | null) ?? (message.type === "event" ? "status_update" : "answer");
    const awaitingOn = (message.awaiting_on as string | null) ?? "none";
    const nextExpectedFrom = (message.next_expected_from as string | null) ?? null;
    path.push({
      seq: index + 2,
      event_type: eventType,
      from_actor: message.sender_slug,
      to_actor: nextExpectedFrom,
      message_id: message.message_id,
      created_at: message.sent_at,
      awaiting_on: awaitingOn,
      next_expected_from: nextExpectedFrom,
    });
    if (awaitingOn && awaitingOn !== "none") {
      lastAwaitingOn = awaitingOn;
      lastNextExpectedFrom = nextExpectedFrom;
    }
  }

  return {
    path,
    awaiting_on: lastAwaitingOn,
    next_expected_from: lastNextExpectedFrom,
  };
}

async function notifyTaskAssignee(threadId: string, db: pg.Pool) {
  const { rows } = await db.query(
    `SELECT
       t.thread_id,
       t.project_id,
       t.subject,
       t.priority,
       t.task_status,
       t.status,
       a.id AS assignee_agent_id,
       a.name AS assignee_name,
       p.slug AS project_slug,
       p.name AS project_name,
       p.agent_briefing,
       first_message.body AS description
     FROM threads t
     JOIN agents a ON a.id = t.assignee_agent_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN LATERAL (
       SELECT tm.body
       FROM thread_messages tm
       WHERE tm.thread_id = t.thread_id AND tm.type = 'message'
       ORDER BY tm.sent_at ASC
       LIMIT 1
     ) first_message ON true
     WHERE t.thread_id = $1
     LIMIT 1`,
    [threadId]
  );
  if (!rows[0]) return;

  const task = rows[0];
  pushToAgent(task.assignee_agent_id, "task_assigned", {
    task_id: task.thread_id,
    thread_id: task.thread_id,
    project_id: task.project_id,
    project_slug: task.project_slug ?? null,
    project_name: task.project_name ?? null,
    agent_briefing: task.agent_briefing ?? null,
    title: task.subject,
    description: task.description ?? "",
    priority: task.priority ?? "normal",
    status: task.task_status ?? task.status,
    assigned_to: task.assignee_name,
  });
}

// ── Fan-out helpers ───────────────────────────────────────────────────────────

function extractMentionSlugs(messageBody: string): string[] {
  return Array.from(
    new Set((messageBody.match(/@([A-Za-z0-9_]+)/g) ?? []).map((m) => m.slice(1).toLowerCase()))
  );
}

async function createMessageReceipts(
  db: pg.Pool,
  messageId: string,
  threadId: string,
  senderId: string
) {
  const { rows: recipients } = await db.query(
    `SELECT participant_id, participant_slug
     FROM thread_participants
     WHERE thread_id = $1
       AND participant_id != $2
       AND removed_at IS NULL`,
    [threadId, senderId]
  );

  for (const recipient of recipients) {
    await db.query(
      `INSERT INTO thread_message_receipts (message_id, recipient_id, recipient_slug, status, sent_at)
       VALUES ($1, $2, $3, 'sent', now())
       ON CONFLICT (message_id, recipient_id)
       DO UPDATE SET recipient_slug = EXCLUDED.recipient_slug,
                     status = CASE WHEN thread_message_receipts.status = 'read' THEN 'read' ELSE 'sent' END,
                     updated_at = now()`,
      [messageId, recipient.participant_id, recipient.participant_slug]
    );
  }
}

async function enqueueReplyRequiredOutbox(
  db: pg.Pool,
  threadId: string,
  messageId: string,
  targetParticipantIds: string[],
  reason: string | null
) {
  if (targetParticipantIds.length === 0) return;

  const { rows: agentRows } = await db.query(
    `SELECT id::text AS id FROM agents WHERE id = ANY($1::uuid[])`,
    [targetParticipantIds]
  );
  const agentIds = agentRows.map((row) => String(row.id));
  if (agentIds.length === 0) return;

  for (const agentId of agentIds) {
    await db.query(
      `INSERT INTO thread_event_outbox (event_type, thread_id, message_id, target_agent_id, payload)
       VALUES ('reply_required', $1, $2, $3, $4::jsonb)`,
      [
        threadId,
        messageId,
        agentId,
        JSON.stringify({
          event_type: "reply_required",
          thread_id: threadId,
          message_id: messageId,
          target_agent_id: agentId,
          reason: reason ?? "unspecified",
          created_at: new Date().toISOString(),
        }),
      ]
    );
  }
}

async function fanOutNotifications(
  db: pg.Pool,
  messageId: string,
  threadId: string,
  senderId: string,
  senderType: Caller["type"],
  priority: string = "normal",
  messageBody: string = ""
) {
  // Parse @mentions — if present, only notify mentioned participants
  const mentionedSlugs = extractMentionSlugs(messageBody);

  // All active participants except sender
  const { rows: allRecipients } = await db.query(
    `SELECT participant_id, participant_slug FROM thread_participants
     WHERE thread_id = $1 AND participant_id != $2 AND removed_at IS NULL`,
    [threadId, senderId]
  );

  // If message has @mentions, only notify the mentioned participants
  const recipients = mentionedSlugs.length > 0
    ? allRecipients.filter(r => mentionedSlugs.includes((r.participant_slug ?? "").toLowerCase()))
    : allRecipients;

  const policy = await loadReplyPolicy(db, threadId);
  const allowedIds = policy?.mode === "restricted"
    ? new Set(policy.allowed_participant_ids)
    : null;
  const routedRecipients = allowedIds
    ? recipients.filter((recipient) => allowedIds.has(recipient.participant_id))
    : recipients;

  for (const r of routedRecipients) {
    const { rows: [notif] } = await db.query(
      `INSERT INTO notifications
         (recipient_id, recipient_slug, message_id, priority)
       VALUES ($1, $2, $3, $4) RETURNING notification_id`,
      [r.participant_id, r.participant_slug, messageId, priority]
    );

    // Real-time push if recipient is an agent connected via WS
    // Enrich with message body/sender so the extension doesn't need a follow-up fetch
    db.query(
      `SELECT tm.body, tm.sender_slug, t.subject,
              (a.id IS NOT NULL) AS sender_is_agent
       FROM thread_messages tm
       JOIN threads t ON t.thread_id = tm.thread_id
       LEFT JOIN agents a ON a.id = tm.sender_id
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
        sender_is_agent: msg?.sender_is_agent ?? false,
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

  if (senderType === "user" && policy?.mode === "restricted" && policy.next_message_limit !== null) {
    await decrementReplyPolicyWindow(db, threadId);
  }
}

async function insertEventMessage(
  db: pg.Pool,
  threadId: string,
  senderId: string,
  senderSlug: string,
  body: string
) {
  const { rows: [message] } = await db.query(
    `INSERT INTO thread_messages (thread_id, sender_id, sender_slug, type, body, intent, awaiting_on)
     VALUES ($1, $2, $3, 'event', $4, 'status_update', 'none')
     RETURNING *`,
    [threadId, senderId, senderSlug, body]
  );
  broadcast("thread.message_created", { thread_id: threadId, message });
  return message;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function registerThreads(server: FastifyInstance, db: pg.Pool) {

  // ── POST /api/v1/threads — create thread ───────────────────────────────────
  server.post<{
    Body: {
      subject: string;
      participants?: string[];
      project_id: string;
      thread_type?: string;
      assignee_agent_id?: string;
      assignee_user_id?: string;
      priority?: string;
      task_status?: string;
      completion_note?: string;
      status?: string;
      description?: string;
      body?: string;
    };
  }>(
    "/threads",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const {
        subject,
        participants = [],
        project_id,
        thread_type = "conversation",
        assignee_agent_id,
        assignee_user_id,
        priority,
        task_status,
        completion_note,
        status = "open",
        description,
        body,
      } = req.body ?? {};
      if (!subject?.trim()) return reply.status(400).send({ ok: false, error: "subject is required" });
      if (!project_id?.trim()) return reply.status(400).send({ ok: false, error: "project_id is required" });
      if (!THREAD_TYPES.has(thread_type)) return reply.status(400).send({ ok: false, error: "invalid thread_type" });
      if (!THREAD_STATUSES.has(status)) return reply.status(400).send({ ok: false, error: "invalid status" });
      if (assignee_agent_id && assignee_user_id) return reply.status(400).send({ ok: false, error: "only one assignee may be set" });

      const normalizedPriority = priority === undefined ? (thread_type === "task" ? "normal" : null) : normalizePriority(priority);
      if (priority !== undefined && !normalizedPriority) return reply.status(400).send({ ok: false, error: "invalid priority" });

      const normalizedTaskStatus = task_status === undefined
        ? (thread_type === "task" && status === "open" ? "proposed" : null)
        : task_status;
      if (normalizedTaskStatus !== null && normalizedTaskStatus !== undefined && !TASK_STATUSES.has(normalizedTaskStatus)) {
        return reply.status(400).send({ ok: false, error: "invalid task_status" });
      }
      if (thread_type !== "task" && (assignee_agent_id || assignee_user_id || normalizedTaskStatus || normalizedPriority || completion_note)) {
        return reply.status(400).send({ ok: false, error: "task fields require thread_type=task" });
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        // Create thread
        const { rows: [thread] } = await client.query(
          `INSERT INTO threads
             (subject, project_id, created_by, created_slug, thread_type, status,
              assignee_agent_id, assignee_user_id, priority, task_status, completion_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            subject.trim(),
            project_id ?? null,
            caller.id,
            caller.slug,
            thread_type,
            status,
            assignee_agent_id ?? null,
            assignee_user_id ?? null,
            thread_type === "task" ? normalizedPriority : null,
            thread_type === "task" && status === "open" ? normalizedTaskStatus : null,
            thread_type === "task" ? completion_note ?? null : null,
          ]
        );

        // Auto-add creator as participant
        await ensureParticipant(client, thread.thread_id, caller.id, caller.slug, caller.id, caller.slug);

        // Add initial participants
        for (const pid of participants) {
          if (pid === caller.id) continue;
          const resolved = await resolveIdentityById(client, pid);
          if (!resolved) continue;
          await ensureParticipant(client, thread.thread_id, resolved.id, resolved.slug, caller.id, caller.slug);
        }

        if (thread_type === "task" && assignee_agent_id) {
          const { rows } = await client.query(
            `SELECT id, COALESCE(slug, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g'))) AS slug
             FROM agents WHERE id = $1 LIMIT 1`,
            [assignee_agent_id]
          );
          if (rows[0]) await ensureParticipant(client, thread.thread_id, rows[0].id, rows[0].slug, caller.id, caller.slug);
        }
        if (thread_type === "task" && assignee_user_id) {
          const { rows } = await client.query(
            `SELECT id, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g')) AS slug
             FROM users WHERE id = $1 LIMIT 1`,
            [assignee_user_id]
          );
          if (rows[0]) await ensureParticipant(client, thread.thread_id, rows[0].id, rows[0].slug, caller.id, caller.slug);
        }

        const descriptionText = (description ?? body ?? "").trim();
        if (descriptionText) {
          await client.query(
            `INSERT INTO thread_messages (thread_id, sender_id, sender_slug, type, body, intent, awaiting_on)
             VALUES ($1, $2, $3, 'message', $4, 'status_update', 'none')`,
            [thread.thread_id, caller.id, caller.slug, descriptionText]
          );
        }

        await client.query("COMMIT");

        const hydratedThread = await hydrateThread(client, thread.thread_id);

        if (thread.thread_type === "task" && thread.assignee_agent_id) {
          await notifyTaskAssignee(thread.thread_id, db);
        }

        broadcast("thread.created", { thread: hydratedThread });
        return { ok: true, thread_id: thread.thread_id, thread: hydratedThread };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // ── POST /threads/direct — one-call 1:1 send (conversation thread) ──────
  // Finds or creates a 1:1 conversation thread between caller and `to`, then posts body.
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

        // Find existing 1:1 conversation thread between caller and recipient within the same project
        const { rows: [existing] } = await client.query(
          `SELECT t.thread_id
           FROM threads t
           JOIN thread_participants pa ON pa.thread_id = t.thread_id AND pa.participant_id = $1 AND pa.removed_at IS NULL
           JOIN thread_participants pb ON pb.thread_id = t.thread_id AND pb.participant_id = $2 AND pb.removed_at IS NULL
           WHERE t.deleted_at IS NULL
             AND t.project_id = $3
             AND t.status = 'open'
             AND t.thread_type = 'conversation'
             AND 2 = (
               SELECT count(*)
               FROM thread_participants p
               WHERE p.thread_id = t.thread_id AND p.removed_at IS NULL
             )
           ORDER BY t.created_at DESC LIMIT 1`,
          [caller.id, recipient.id, project_id]
        );

        let thread_id: string;

        if (existing) {
          thread_id = existing.thread_id;
        } else {
          // Create new 1:1 conversation thread
          const autoSubject = subject?.trim() || `${caller.slug} ↔ ${recipient.slug}`;
          const { rows: [thread] } = await client.query(
            `INSERT INTO threads (subject, project_id, created_by, created_slug, thread_type)
             VALUES ($1, $2, $3, $4, 'conversation') RETURNING thread_id`,
            [autoSubject, project_id, caller.id, caller.slug]
          );
          thread_id = thread.thread_id;

          // Add both as participants
          for (const p of [{ id: caller.id, slug: caller.slug }, { id: recipient.id, slug: recipient.slug }]) {
            await ensureParticipant(client, thread_id, p.id, p.slug, caller.id, caller.slug);
          }
        }

        // Send message
        const { rows: [message] } = await client.query(
          `INSERT INTO thread_messages (thread_id, sender_id, sender_slug, type, body, intent, awaiting_on)
           VALUES ($1, $2, $3, 'message', $4, $5, 'none') RETURNING *`,
          [thread_id, caller.id, caller.slug, body.trim(), caller.type === "agent" ? "answer" : "question"]
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

        broadcast("thread.message_created", { thread_id, message });

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
  server.get<{
    Querystring: {
      search?: string;
      limit?: string;
      offset?: string;
      include_deleted?: string;
      project_id?: string;
      status?: string;
      type?: string;
      task_status?: string;
      assignee_agent_id?: string;
      assignee_user_id?: string;
    };
  }>(
    "/threads",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const {
        search,
        limit = "10",
        offset = "0",
        include_deleted,
        project_id,
        status = "open",
        type,
        task_status,
        assignee_agent_id,
        assignee_user_id,
      } = req.query;
      const lim = Math.min(Number(limit), 100);
      const off = Number(offset);
      const showDeleted = include_deleted === "true";
      const pid = project_id?.trim() || null;
      const statusFilter = THREAD_STATUSES.has(status) ? status : null;
      const typeFilter = type && THREAD_TYPES.has(type) ? type : null;
      const taskStatusFilter = task_status && TASK_STATUSES.has(task_status) ? task_status : null;
      const assigneeAgentFilter = assignee_agent_id?.trim() || null;
      const assigneeUserFilter = assignee_user_id?.trim() || null;

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
          SELECT DISTINCT
            t.*,
            tp_self.removed_at AS my_removed_at,
            COALESCE(assignee_agent.name, assignee_user.name) AS assignee_name,
            first_message.body AS description,
            COALESCE(last_message.sent_at, t.created_at) AS last_activity
          FROM threads t
          JOIN visible v ON v.thread_id = t.thread_id
          LEFT JOIN thread_participants tp_self
            ON tp_self.thread_id = t.thread_id AND tp_self.participant_id = $1
          LEFT JOIN thread_messages tm ON tm.thread_id = t.thread_id
          LEFT JOIN agents assignee_agent ON assignee_agent.id = t.assignee_agent_id
          LEFT JOIN users assignee_user ON assignee_user.id = t.assignee_user_id
          LEFT JOIN LATERAL (
            SELECT body FROM thread_messages
            WHERE thread_id = t.thread_id AND type = 'message'
            ORDER BY sent_at ASC
            LIMIT 1
          ) first_message ON true
          LEFT JOIN LATERAL (
            SELECT sent_at FROM thread_messages
            WHERE thread_id = t.thread_id
            ORDER BY sent_at DESC
            LIMIT 1
          ) last_message ON true
          WHERE
            ($3 = false OR t.deleted_at IS NULL)
            AND ($4::uuid IS NULL OR t.project_id = $4)
            AND ($5::text IS NULL OR t.status = $5)
            AND ($6::text IS NULL OR t.thread_type = $6)
            AND ($7::text IS NULL OR t.task_status = $7)
            AND ($8::uuid IS NULL OR t.assignee_agent_id = $8)
            AND ($9::uuid IS NULL OR t.assignee_user_id = $9)
            AND (
              to_tsvector('english', t.subject) @@ plainto_tsquery('english', $10)
              OR to_tsvector('english', COALESCE(tm.body, '')) @@ plainto_tsquery('english', $10)
            )
          ORDER BY COALESCE(last_message.sent_at, t.created_at) DESC, t.created_at DESC
          LIMIT $11 OFFSET $12`;
        params = [
          caller.id,
          caller.type === "user",
          !showDeleted,
          pid,
          statusFilter,
          typeFilter,
          taskStatusFilter,
          assigneeAgentFilter,
          assigneeUserFilter,
          search.trim(),
          lim,
          off,
        ];
      } else {
        query = `${visibilityCte}
          SELECT
            t.*,
            tp_self.removed_at AS my_removed_at,
            COALESCE(assignee_agent.name, assignee_user.name) AS assignee_name,
            first_message.body AS description,
            COALESCE(last_message.sent_at, t.created_at) AS last_activity
          FROM threads t
          JOIN visible v ON v.thread_id = t.thread_id
          LEFT JOIN thread_participants tp_self
            ON tp_self.thread_id = t.thread_id AND tp_self.participant_id = $1
          LEFT JOIN agents assignee_agent ON assignee_agent.id = t.assignee_agent_id
          LEFT JOIN users assignee_user ON assignee_user.id = t.assignee_user_id
          LEFT JOIN LATERAL (
            SELECT body FROM thread_messages
            WHERE thread_id = t.thread_id AND type = 'message'
            ORDER BY sent_at ASC
            LIMIT 1
          ) first_message ON true
          LEFT JOIN LATERAL (
            SELECT sent_at FROM thread_messages
            WHERE thread_id = t.thread_id
            ORDER BY sent_at DESC
            LIMIT 1
          ) last_message ON true
          WHERE
            ($3 = false OR t.deleted_at IS NULL)
            AND ($4::uuid IS NULL OR t.project_id = $4)
            AND ($5::text IS NULL OR t.status = $5)
            AND ($6::text IS NULL OR t.thread_type = $6)
            AND ($7::text IS NULL OR t.task_status = $7)
            AND ($8::uuid IS NULL OR t.assignee_agent_id = $8)
            AND ($9::uuid IS NULL OR t.assignee_user_id = $9)
          ORDER BY COALESCE(last_message.sent_at, t.created_at) DESC, t.created_at DESC
          LIMIT $10 OFFSET $11`;
        params = [
          caller.id,
          caller.type === "user",
          !showDeleted,
          pid,
          statusFilter,
          typeFilter,
          taskStatusFilter,
          assigneeAgentFilter,
          assigneeUserFilter,
          lim,
          off,
        ];
      }

      const { rows } = await db.query(query, params);
      const threads = await Promise.all(
        rows.map(async (row) => ({
          ...row,
          next_reply: await loadThreadNextReply(db, row.thread_id as string),
        }))
      );
      return { ok: true, threads, limit: lim, offset: off };
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

      const thread = await hydrateThread(db, req.params.thread_id);
      const flow = await buildThreadFlow(db, req.params.thread_id);
      return { ok: true, thread: thread ?? access.thread, participants, role: access.role, flow };
    }
  );

  server.get<{ Params: { thread_id: string } }>(
    "/threads/:thread_id/sla",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found or no access" });

      const replyPolicy = await loadReplyPolicy(db, req.params.thread_id);
      const { rows: [slaState] } = await db.query(
        `SELECT *
         FROM task_sla_state
         WHERE thread_id = $1
         LIMIT 1`,
        [req.params.thread_id]
      );

      return { ok: true, reply_policy: replyPolicy, sla_state: (slaState ?? null) as TaskSlaState | null };
    }
  );

  server.patch<{
    Params: { thread_id: string };
    Body: {
      mode?: NextReplyMode;
      pending_participant_ids?: string[];
      reason?: string | null;
      expires_at?: string | null;
    };
  }>(
    "/threads/:thread_id/next-reply",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });

      const isManager = access.role === "creator" || access.role === "owner";
      const isCoordinator = await isThreadCoordinator(access.thread as Record<string, unknown>, caller, db);
      if (!isManager && !isCoordinator) {
        return reply.status(403).send({ ok: false, error: "only the thread creator, owner, or coordinator can set next reply" });
      }

      const mode = req.body?.mode;
      const pendingParticipantIds = Array.isArray(req.body?.pending_participant_ids)
        ? Array.from(new Set(req.body.pending_participant_ids.map((id) => String(id).trim()).filter(Boolean)))
        : [];
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() || null : req.body?.reason === null ? null : null;
      const expiresAt = typeof req.body?.expires_at === "string" ? req.body.expires_at : req.body?.expires_at === null ? null : null;

      if (pendingParticipantIds.length === 0) {
        await clearThreadNextReply(db, req.params.thread_id);
        const thread = await hydrateThread(db, req.params.thread_id);
        broadcast("thread.updated", { thread_id: req.params.thread_id, thread });
        return { ok: true, thread, next_reply: null };
      }

      if (mode !== "any" && mode !== "all") {
        return reply.status(400).send({ ok: false, error: "mode must be any or all" });
      }
      if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
        return reply.status(400).send({ ok: false, error: "expires_at must be a valid ISO timestamp" });
      }

      const { rows: validParticipants } = await db.query(
        `SELECT participant_id, participant_slug
         FROM thread_participants
         WHERE thread_id = $1
           AND participant_id = ANY($2::uuid[])
           AND removed_at IS NULL`,
        [req.params.thread_id, pendingParticipantIds]
      );
      if (validParticipants.length !== pendingParticipantIds.length) {
        return reply.status(400).send({ ok: false, error: "pending_participant_ids must all be active thread participants" });
      }

      await upsertThreadNextReply(db, req.params.thread_id, caller.id, mode, pendingParticipantIds, reason, expiresAt);
      const thread = await hydrateThread(db, req.params.thread_id);
      broadcast("thread.updated", { thread_id: req.params.thread_id, thread });
      return { ok: true, thread, next_reply: thread?.next_reply ?? null };
    }
  );

  server.delete<{ Params: { thread_id: string } }>(
    "/threads/:thread_id/next-reply",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });

      const isManager = access.role === "creator" || access.role === "owner";
      const isCoordinator = await isThreadCoordinator(access.thread as Record<string, unknown>, caller, db);
      if (!isManager && !isCoordinator) {
        return reply.status(403).send({ ok: false, error: "only the thread creator, owner, or coordinator can clear next reply" });
      }

      await clearThreadNextReply(db, req.params.thread_id);
      const thread = await hydrateThread(db, req.params.thread_id);
      broadcast("thread.updated", { thread_id: req.params.thread_id, thread });
      return { ok: true, thread, next_reply: null };
    }
  );

  server.patch<{ Params: { thread_id: string }; Body: Record<string, unknown> }>(
    "/threads/:thread_id",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });

      const thread = access.thread as Record<string, unknown>;
      const isManager = access.role === "creator" || access.role === "owner";
      const isAssignedAgent = caller.type === "agent" && thread.assignee_agent_id === caller.id && thread.thread_type === "task";
      if (!isManager && !isAssignedAgent) {
        return reply.status(403).send({ ok: false, error: "forbidden" });
      }

      const requestedStatus = typeof req.body.status === "string" ? req.body.status.trim() : undefined;
      const requestedThreadType = typeof req.body.thread_type === "string" ? req.body.thread_type.trim() : undefined;
      const requestedTaskStatus = typeof req.body.task_status === "string" ? req.body.task_status.trim() : undefined;
      const requestedSubject = typeof req.body.subject === "string" ? req.body.subject.trim() : undefined;
      const requestedDescription = typeof req.body.description === "string" ? req.body.description.trim() : undefined;
      const requestedCompletionNote =
        typeof req.body.completion_note === "string" || req.body.completion_note === null
          ? req.body.completion_note
          : undefined;
      const requestedAssigneeAgentId =
        typeof req.body.assignee_agent_id === "string" ? req.body.assignee_agent_id.trim() : req.body.assignee_agent_id === null ? null : undefined;
      const requestedAssigneeUserId =
        typeof req.body.assignee_user_id === "string" ? req.body.assignee_user_id.trim() : req.body.assignee_user_id === null ? null : undefined;
      const requestedPriority = req.body.priority === undefined ? undefined : normalizePriority(req.body.priority);

      if (requestedStatus !== undefined && !THREAD_STATUSES.has(requestedStatus)) {
        return reply.status(400).send({ ok: false, error: "invalid status" });
      }
      if (requestedThreadType !== undefined && !THREAD_TYPES.has(requestedThreadType)) {
        return reply.status(400).send({ ok: false, error: "invalid thread_type" });
      }
      if (requestedTaskStatus !== undefined && !TASK_STATUSES.has(requestedTaskStatus)) {
        return reply.status(400).send({ ok: false, error: "invalid task_status" });
      }
      if (req.body.priority !== undefined && !requestedPriority) {
        return reply.status(400).send({ ok: false, error: "invalid priority" });
      }
      if (requestedAssigneeAgentId && requestedAssigneeUserId) {
        return reply.status(400).send({ ok: false, error: "only one assignee may be set" });
      }
      const effectiveThreadType = requestedThreadType ?? String(thread.thread_type ?? "conversation");
      if (effectiveThreadType !== "task" && (requestedTaskStatus !== undefined || requestedCompletionNote !== undefined || requestedAssigneeAgentId !== undefined || requestedAssigneeUserId !== undefined || requestedPriority !== undefined)) {
        return reply.status(400).send({ ok: false, error: "task fields require thread_type=task" });
      }

      if (isAssignedAgent) {
        const allowedAgentFields = new Set(["task_status", "completion_note"]);
        for (const key of Object.keys(req.body)) {
          if (!allowedAgentFields.has(key)) {
            return reply.status(403).send({ ok: false, error: "forbidden field for assignee update" });
          }
        }
      }

      if (requestedStatus === "closed" && thread.thread_type === "task") {
        const permitted = await canCloseTaskThread(req.params.thread_id, caller, db);
        if (!permitted) {
          return reply.status(403).send({ ok: false, error: "only the coordinator or project owner can close a task thread" });
        }
        await closeTaskThread(req.params.thread_id, caller, db);
        await insertEventMessage(db, req.params.thread_id, caller.id, caller.slug, describeTaskLifecycleEvent("task.done", caller.slug));
        await upsertTaskSlaState(db, req.params.thread_id, "task.done");
        const closed = await hydrateThread(db, req.params.thread_id);
        broadcast("thread.status_changed", { thread_id: req.params.thread_id, status: "closed" });
        return { ok: true, thread: closed };
      }

      const previousTaskStatus = typeof thread.task_status === "string" ? thread.task_status : null;

      const sets: string[] = [];
      const values: unknown[] = [];

      if (requestedSubject !== undefined) {
        if (!isManager || !requestedSubject) return reply.status(403).send({ ok: false, error: "only the thread creator or owner can update subject" });
        values.push(requestedSubject);
        sets.push(`subject = $${values.length}`);
      }
      if (requestedThreadType !== undefined) {
        if (!isManager) return reply.status(403).send({ ok: false, error: "only the thread creator or owner can update thread_type" });
        values.push(requestedThreadType);
        sets.push(`thread_type = $${values.length}`);
        if (requestedThreadType === "task" && thread.thread_type !== "task") {
          if (requestedPriority === undefined && !thread.priority) {
            values.push("normal");
            sets.push(`priority = $${values.length}`);
          }
          if (requestedTaskStatus === undefined && !thread.task_status) {
            values.push("proposed");
            sets.push(`task_status = $${values.length}`);
          }
        }
      }
      if (requestedStatus !== undefined) {
        if (!isManager) return reply.status(403).send({ ok: false, error: "only the thread creator or owner can update status" });
        values.push(requestedStatus);
        sets.push(`status = $${values.length}`);
        if (thread.thread_type === "task" && requestedStatus === "open") {
          sets.push("done_at = null", "done_by_user_id = null", "done_by_agent_id = null");
        }
      }
      if (requestedTaskStatus !== undefined) {
        values.push(requestedTaskStatus);
        sets.push(`task_status = $${values.length}`, "done_at = null", "done_by_user_id = null", "done_by_agent_id = null");
      }
      if (requestedCompletionNote !== undefined) {
        values.push(requestedCompletionNote);
        sets.push(`completion_note = $${values.length}`);
      }
      if (requestedPriority !== undefined) {
        if (!isManager) return reply.status(403).send({ ok: false, error: "only the thread creator or owner can update priority" });
        values.push(requestedPriority);
        sets.push(`priority = $${values.length}`);
      }
      if (requestedAssigneeAgentId !== undefined) {
        if (!isManager) return reply.status(403).send({ ok: false, error: "only the thread creator or owner can update assignee" });
        values.push(requestedAssigneeAgentId);
        sets.push(`assignee_agent_id = $${values.length}`, "assignee_user_id = null");
      }
      if (requestedAssigneeUserId !== undefined) {
        if (!isManager) return reply.status(403).send({ ok: false, error: "only the thread creator or owner can update assignee" });
        values.push(requestedAssigneeUserId);
        sets.push(`assignee_user_id = $${values.length}`, "assignee_agent_id = null");
      }

      let updatedThread = thread;
      if (sets.length > 0) {
        values.push(req.params.thread_id);
        const { rows } = await db.query(
          `UPDATE threads SET ${sets.join(", ")} WHERE thread_id = $${values.length} RETURNING *`,
          values
        );
        updatedThread = rows[0];
      }

      if (requestedDescription !== undefined) {
        if (!isManager) return reply.status(403).send({ ok: false, error: "only the thread creator or owner can update description" });
        if (requestedDescription) {
          await upsertDescriptionMessage(db, req.params.thread_id, caller.id, caller.slug, requestedDescription);
        }
      }

      if (requestedAssigneeAgentId) {
        const resolved = await resolveIdentityById(db, requestedAssigneeAgentId);
        if (resolved) {
          await ensureParticipant(db, req.params.thread_id, resolved.id, resolved.slug, caller.id, caller.slug);
          await insertEventMessage(db, req.params.thread_id, caller.id, caller.slug, `${resolved.slug} was assigned by ${caller.slug}`);
          await notifyTaskAssignee(req.params.thread_id, db);
        }
      }
      if (requestedAssigneeUserId) {
        const resolved = await resolveIdentityById(db, requestedAssigneeUserId);
        if (resolved) {
          await ensureParticipant(db, req.params.thread_id, resolved.id, resolved.slug, caller.id, caller.slug);
          await insertEventMessage(db, req.params.thread_id, caller.id, caller.slug, `${resolved.slug} was assigned by ${caller.slug}`);
        }
      }
      const taskEvent = mapTaskEventForStatus(previousTaskStatus, requestedTaskStatus);
      if (taskEvent) {
        await insertEventMessage(db, req.params.thread_id, caller.id, caller.slug, describeTaskLifecycleEvent(taskEvent, caller.slug));
        await upsertTaskSlaState(db, req.params.thread_id, taskEvent);
      }
      if (requestedTaskStatus === "approved" && (updatedThread as Record<string, unknown>).assignee_agent_id) {
        await notifyTaskAssignee(req.params.thread_id, db);
      }

      const hydratedThread = await hydrateThread(db, req.params.thread_id);
      broadcast("thread.updated", { thread_id: req.params.thread_id, thread: hydratedThread ?? updatedThread });
      return { ok: true, thread: hydratedThread ?? updatedThread };
    }
  );

  server.post<{ Params: { thread_id: string } }>(
    "/threads/:thread_id/close",
    async (req, reply) => {
      const caller = await resolveCaller(req, db);
      if (!caller) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });
      if ((access.thread as Record<string, unknown>).thread_type !== "task") {
        return reply.status(400).send({ ok: false, error: "close is only supported for task threads" });
      }

      const permitted = await canCloseTaskThread(req.params.thread_id, caller, db);
      if (!permitted) {
        return reply.status(403).send({ ok: false, error: "only the coordinator or project owner can close a task thread" });
      }

      await closeTaskThread(req.params.thread_id, caller, db);
      await insertEventMessage(db, req.params.thread_id, caller.id, caller.slug, describeTaskLifecycleEvent("task.done", caller.slug));
      await upsertTaskSlaState(db, req.params.thread_id, "task.done");
      const thread = await hydrateThread(db, req.params.thread_id);
      broadcast("thread.status_changed", { thread_id: req.params.thread_id, status: "closed" });
      return { ok: true, thread };
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
      broadcast("thread.deleted", { thread_id: req.params.thread_id });
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
      if (!THREAD_STATUSES.has(status)) {
        return reply.status(400).send({ ok: false, error: "status must be open, closed, or archived" });
      }

      const access = await checkThreadAccess(req.params.thread_id, caller, db);
      if (!access) return reply.status(404).send({ ok: false, error: "thread not found" });
      if ((access.thread as Record<string, unknown>).thread_type === "task" && status === "closed") {
        const permitted = await canCloseTaskThread(req.params.thread_id, caller, db);
        if (!permitted) {
          return reply.status(403).send({ ok: false, error: "only the coordinator or project owner can close a task thread" });
        }
        const thread = await closeTaskThread(req.params.thread_id, caller, db);
        await insertEventMessage(db, req.params.thread_id, caller.id, caller.slug, describeTaskLifecycleEvent("task.done", caller.slug));
        await upsertTaskSlaState(db, req.params.thread_id, "task.done");
        broadcast("thread.status_changed", { thread_id: req.params.thread_id, status });
        return { ok: true, status, thread };
      }
      if (access.role !== "creator" && access.role !== "owner") {
        return reply.status(403).send({ ok: false, error: "only the thread creator or owner can change status" });
      }

      await db.query(
        `UPDATE threads
         SET status = $1,
             done_at = CASE WHEN $1 = 'open' THEN null ELSE done_at END,
             done_by_user_id = CASE WHEN $1 = 'open' THEN null ELSE done_by_user_id END,
             done_by_agent_id = CASE WHEN $1 = 'open' THEN null ELSE done_by_agent_id END
         WHERE thread_id = $2`,
        [status, req.params.thread_id]
      );
      broadcast("thread.status_changed", { thread_id: req.params.thread_id, status });
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
      await removeParticipantFromNextReply(db, req.params.thread_id, req.params.pid);

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
    Body: {
      body?: string;
      reply_to?: string;
      priority?: string;
      attachments?: ThreadAttachment[];
      intent?: string;
      intent_confidence?: number;
      awaiting_on?: "user" | "agent" | "none";
      next_expected_from?: string | null;
    };
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

      const {
        body = "",
        reply_to,
        priority = "normal",
        attachments = [],
        intent,
        intent_confidence,
        awaiting_on,
        next_expected_from,
      } = req.body ?? {};
      const cleanBody = body.trim();
      const safeAttachments = Array.isArray(attachments) ? attachments.filter(Boolean).slice(0, 8) : [];

      const normalizedIntent = typeof intent === "string" ? intent.trim().toLowerCase() : "";
      const normalizedAwaitingOn = typeof awaiting_on === "string" ? awaiting_on.trim().toLowerCase() : "none";
      const normalizedNextExpectedFrom =
        typeof next_expected_from === "string" ? next_expected_from.trim() : next_expected_from ?? null;
      const effectiveIntent = normalizedIntent || (caller.type === "agent" ? "answer" : "question");

      let effectiveAwaitingOn = normalizedAwaitingOn;
      let effectiveNextExpectedFrom = normalizedNextExpectedFrom;
      let pendingParticipantIdsForNextReply: string[] = [];
      let nextReplyReason: string | null = null;

      for (const a of safeAttachments) {
        if (!a || typeof a !== "object" || typeof a.url !== "string") {
          return reply.status(400).send({ ok: false, error: "invalid attachments payload" });
        }
      }

      if (!cleanBody && safeAttachments.length === 0) {
        return reply.status(400).send({ ok: false, error: "body or attachments required" });
      }
      if (!MESSAGE_INTENTS.has(effectiveIntent)) {
        return reply.status(400).send({ ok: false, error: "invalid intent" });
      }
      if (caller.type === "agent" && !normalizedIntent) {
        return reply.status(400).send({ ok: false, error: "intent is required for agent messages" });
      }
      if (!AWAITING_ON_VALUES.has(normalizedAwaitingOn)) {
        return reply.status(400).send({ ok: false, error: "awaiting_on must be user, agent, or none" });
      }
      if ((effectiveIntent === "blocked" || effectiveIntent === "review_request") && normalizedAwaitingOn === "none") {
        return reply.status(400).send({ ok: false, error: "awaiting_on is required for blocked/review_request" });
      }
      if ((effectiveIntent === "blocked" || effectiveIntent === "review_request") && !normalizedNextExpectedFrom) {
        return reply.status(400).send({ ok: false, error: "next_expected_from is required for blocked/review_request" });
      }
      if (intent_confidence !== undefined) {
        if (typeof intent_confidence !== "number" || Number.isNaN(intent_confidence) || intent_confidence < 0 || intent_confidence > 1) {
          return reply.status(400).send({ ok: false, error: "intent_confidence must be between 0 and 1" });
        }
      }

      // Default awaiting behavior for user questions:
      // - no @mentions => await all active participants (except sender)
      // - @mentions present => await only mentioned active participants
      if (caller.type === "user" && effectiveIntent === "question") {
        const { rows: activeParticipants } = await db.query(
          `SELECT participant_id, participant_slug
           FROM thread_participants
           WHERE thread_id = $1
             AND participant_id != $2
             AND removed_at IS NULL`,
          [req.params.thread_id, caller.id]
        );

        const mentionedSlugs = extractMentionSlugs(cleanBody);
        const targetedParticipants = mentionedSlugs.length > 0
          ? activeParticipants.filter((participant) => mentionedSlugs.includes(String(participant.participant_slug ?? "").toLowerCase()))
          : activeParticipants;

        pendingParticipantIdsForNextReply = targetedParticipants.map((participant) => String(participant.participant_id));

        if (pendingParticipantIdsForNextReply.length > 0) {
          if (normalizedAwaitingOn === "none") {
            effectiveAwaitingOn = "agent";
          }
          if (!effectiveNextExpectedFrom) {
            effectiveNextExpectedFrom = mentionedSlugs.length > 0
              ? targetedParticipants.map((participant) => String(participant.participant_slug)).join(",")
              : "ALL_PARTICIPANTS";
          }
          nextReplyReason = mentionedSlugs.length > 0 ? "mentions" : "all_participants";
        }
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
        `INSERT INTO thread_messages (
           thread_id, reply_to, sender_id, sender_slug, body, attachments,
           intent, intent_confidence, awaiting_on, next_expected_from
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10) RETURNING *`,
        [
          req.params.thread_id,
          reply_to ?? null,
          caller.id,
          caller.slug,
          cleanBody,
          JSON.stringify(safeAttachments),
          effectiveIntent,
          intent_confidence ?? null,
          effectiveAwaitingOn,
          effectiveNextExpectedFrom,
        ]
      );

      const nextReplyBeforeMessage = await loadThreadNextReply(db, req.params.thread_id);
      const isTargetedAgentReply =
        caller.type === "agent" &&
        !!nextReplyBeforeMessage?.pending_participant_ids.includes(caller.id);
      const canResolveTargetedReply =
        !isTargetedAgentReply || TARGETED_REPLY_MESSAGE_INTENTS.has(effectiveIntent);

      if (isTargetedAgentReply && !canResolveTargetedReply) {
        req.log.warn(
          {
            thread_id: req.params.thread_id,
            agent_id: caller.id,
            intent: effectiveIntent,
            pending_participant_ids: nextReplyBeforeMessage?.pending_participant_ids ?? [],
            metric: "targeted_notification_reply_violation",
          },
          "agent posted non-resolving message while targeted for next reply"
        );
      }

      if (canResolveTargetedReply) {
        await resolveThreadNextReplyOnMessage(db, req.params.thread_id, caller.id);
      }

      if (pendingParticipantIdsForNextReply.length > 0) {
        await upsertThreadNextReply(
          db,
          req.params.thread_id,
          caller.id,
          "all",
          pendingParticipantIdsForNextReply,
          nextReplyReason,
          null
        );
      }

      await createMessageReceipts(db, msg.message_id, req.params.thread_id, caller.id);

      if (caller.type === "user" && effectiveIntent === "question") {
        await enqueueReplyRequiredOutbox(
          db,
          req.params.thread_id,
          msg.message_id,
          pendingParticipantIdsForNextReply,
          nextReplyReason
        );
      }

      // Fan out notifications to all active participants except sender
      await fanOutNotifications(db, msg.message_id, req.params.thread_id, caller.id, caller.type, priority, cleanBody);

      broadcast("thread.message_created", { thread_id: req.params.thread_id, message: msg });
      const hydratedThread = await hydrateThread(db, req.params.thread_id);
      broadcast("thread.updated", { thread_id: req.params.thread_id, thread: hydratedThread });

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

