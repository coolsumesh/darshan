import type pg from "pg";
import { Worker } from "../vendor/bullmq.js";
import { broadcast, pushToAgent } from "../broadcast.js";
import {
  getTaskSlaConnection,
  syncTaskSlaJobs,
  TASK_SLA_QUEUE_NAME,
  type TaskSlaJobData,
  type TaskSlaJobName,
} from "./taskSlaQueue.js";

async function insertEventMessage(db: pg.Pool, threadId: string, body: string) {
  const { rows: [thread] } = await db.query(
    `SELECT created_by FROM threads WHERE thread_id = $1 LIMIT 1`,
    [threadId]
  );
  if (!thread?.created_by) return null;

  const { rows: [message] } = await db.query(
    `INSERT INTO thread_messages (thread_id, sender_id, sender_slug, type, body)
     VALUES ($1, $2, 'SYSTEM', 'event', $3)
     RETURNING *`,
    [threadId, thread.created_by, body]
  );

  broadcast("thread.message_created", { thread_id: threadId, message });
  return message as { message_id: string } | null;
}

async function resolveRecipients(db: pg.Pool, threadId: string) {
  const recipientMap = new Map<string, string>();

  const { rows } = await db.query(
    `SELECT t.assignee_agent_id, t.assignee_user_id, t.project_id, p.owner_user_id
     FROM threads t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.thread_id = $1
     LIMIT 1`,
    [threadId]
  );
  const thread = rows[0];
  if (!thread) return recipientMap;

  const ids = new Set<string>();
  if (thread.assignee_agent_id) ids.add(thread.assignee_agent_id);
  if (thread.assignee_user_id) ids.add(thread.assignee_user_id);
  if (thread.owner_user_id) ids.add(thread.owner_user_id);

  if (thread.project_id) {
    const { rows: coordinators } = await db.query(
      `SELECT a.id, COALESCE(a.slug, upper(regexp_replace(a.name, '[^A-Za-z0-9]', '_', 'g'))) AS slug
       FROM project_agent_roles par
       JOIN agents a ON a.id = par.agent_id
       WHERE par.project_id = $1 AND par.agent_role = 'coordinator'`,
      [thread.project_id]
    );
    for (const row of coordinators) recipientMap.set(row.id, row.slug);
  }

  if (ids.size > 0) {
    const { rows: identities } = await db.query(
      `SELECT id, COALESCE(slug, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g'))) AS slug, 'agent' AS kind
       FROM agents
       WHERE id = ANY($1::uuid[])
       UNION ALL
       SELECT id, upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g')) AS slug, 'user' AS kind
       FROM users
       WHERE id = ANY($1::uuid[])`,
      [Array.from(ids)]
    );
    for (const row of identities) recipientMap.set(row.id, row.slug);
  }

  return recipientMap;
}

async function notifyRecipients(db: pg.Pool, threadId: string, messageId: string) {
  const recipients = await resolveRecipients(db, threadId);
  for (const [recipientId, recipientSlug] of recipients.entries()) {
    const { rows: [notification] } = await db.query(
      `INSERT INTO notifications (recipient_id, recipient_slug, message_id, priority)
       VALUES ($1, $2, $3, 'high')
       RETURNING notification_id`,
      [recipientId, recipientSlug, messageId]
    );

    pushToAgent(recipientId, "notification", {
      notification_id: notification.notification_id,
      message_id: messageId,
      thread_id: threadId,
      type: "task_sla",
      priority: "high",
    });
  }
}

async function handleTimeout(db: pg.Pool, name: TaskSlaJobName, data: TaskSlaJobData) {
  const dueColumn = name === "pickup-timeout" ? "pickup_due_at" : "progress_due_at";
  const expectedStatus = name === "pickup-timeout" ? "approved" : "in-progress";
  const staleReason = name === "pickup-timeout" ? "pickup-timeout" : "progress-timeout";
  const eventBody = name === "pickup-timeout" ? "Pickup SLA missed" : "Progress SLA missed";

  const { rows: [current] } = await db.query(
    `SELECT t.thread_id, t.task_status, t.status, s.${dueColumn} AS due_at, s.stale_reason
     FROM threads t
     JOIN task_sla_state s ON s.thread_id = t.thread_id
     WHERE t.thread_id = $1
     LIMIT 1`,
    [data.threadId]
  );

  if (!current) return;
  if (current.status !== "open" || current.task_status !== expectedStatus) return;
  if (!current.due_at || new Date(current.due_at).getTime() !== new Date(data.dueAt).getTime()) return;
  if (current.stale_reason === staleReason) return;

  const message = await insertEventMessage(db, data.threadId, eventBody);
  await db.query(
    `UPDATE task_sla_state
     SET stale_reason = $2,
         last_event_type = $3,
         last_event_at = now()
     WHERE thread_id = $1`,
    [data.threadId, staleReason, staleReason]
  );

  if (message?.message_id) {
    await notifyRecipients(db, data.threadId, message.message_id);
  }
}

export async function startTaskSlaWorker(db: pg.Pool) {
  const worker = new Worker<TaskSlaJobData>(
    TASK_SLA_QUEUE_NAME,
    async (job) => {
      await handleTimeout(db, job.name as TaskSlaJobName, job.data);
    },
    {
      connection: getTaskSlaConnection(),
    }
  );

  const { rows } = await db.query(
    `SELECT thread_id, pickup_due_at, progress_due_at
     FROM task_sla_state
     WHERE pickup_due_at IS NOT NULL OR progress_due_at IS NOT NULL`
  );

  for (const row of rows) {
    await syncTaskSlaJobs(row);
  }

  return worker;
}
