/**
 * threadReplyRequiredBroadcaster
 *
 * Consumes the `darshan:reply_required` Redis stream and pushes each event
 * to the targeted agent via the existing WebSocket connection (pushToAgent).
 *
 * This keeps Redis internal on the server — no external port exposure needed.
 * The plugin receives `reply_required` events over the authenticated WS
 * connection it already maintains.
 */

import type pg from "pg";
import { createClient } from "redis";
import { pushToAgent } from "../broadcast.js";

const STREAM_KEY    = process.env.THREAD_REPLY_REQUIRED_STREAM ?? "darshan:reply_required";
const CONSUMER_GROUP = "darshan_api_v1";
const CONSUMER_ID   = `api_broadcaster_${process.pid}`;
const BLOCK_MS      = 5000;
const BATCH_SIZE    = 20;
const RETRY_DELAY   = 5000;

let running = false;

export async function startThreadReplyRequiredBroadcaster(_db: pg.Pool) {
  if (running) return;
  running = true;

  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const client = createClient({ url });
  client.on("error", (e) => console.error("[reply-broadcaster] redis error", e));
  await client.connect();

  // Create consumer group (idempotent)
  try {
    await client.xGroupCreate(STREAM_KEY, CONSUMER_GROUP, "0", { MKSTREAM: true });
  } catch (e: any) {
    if (!String(e?.message ?? "").includes("BUSYGROUP")) throw e;
  }

  console.info(`[reply-broadcaster] started — stream=${STREAM_KEY} group=${CONSUMER_GROUP} consumer=${CONSUMER_ID}`);

  const loop = async () => {
    while (running) {
      try {
        // Read new events
        const results: any[] = (await client.xReadGroup(
          CONSUMER_GROUP,
          CONSUMER_ID,
          [{ key: STREAM_KEY, id: ">" }],
          { COUNT: BATCH_SIZE, BLOCK: BLOCK_MS }
        )) ?? [];

        for (const stream of results) {
          for (const msg of stream.messages ?? []) {
            await handleStreamMessage(client, msg, _db);
          }
        }

        // Reclaim abandoned entries older than 60s (other consumer crashed)
        try {
          const reclaimed: any = await client.xAutoClaim(
            STREAM_KEY, CONSUMER_GROUP, CONSUMER_ID, 60000, "0-0", { COUNT: 10 }
          );
          for (const msg of reclaimed?.messages ?? []) {
            await handleStreamMessage(client, msg, _db);
          }
        } catch { /* xAutoClaim not supported on older Redis — skip silently */ }

      } catch (err: any) {
        if (!running) break;
        console.error(`[reply-broadcaster] loop error: ${err?.message} — retrying in ${RETRY_DELAY}ms`);
        await delay(RETRY_DELAY);
      }
    }

    await client.quit().catch(() => {});
    console.info("[reply-broadcaster] stopped");
  };

  loop().catch((e) => console.error("[reply-broadcaster] fatal:", e));
}

async function handleStreamMessage(
  client: any,
  msg: { id: string; message: Record<string, string> },
  db: pg.Pool,
) {
  const fields = msg.message;
  const targetAgentId = fields.target_agent_id;
  const eventId       = fields.event_id;
  const threadId      = fields.thread_id;
  const messageId     = fields.message_id;

  if (!targetAgentId || !threadId || !messageId) {
    await client.xAck(STREAM_KEY, CONSUMER_GROUP, msg.id).catch(() => {});
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(fields.payload ?? "{}");
  } catch {
    payload = {};
  }

  // Fetch full message details from DB so the plugin has body/sender/subject
  // (the outbox payload only contains IDs — no message content)
  let message_body    = "";
  let message_from    = "";
  let message_subject = "";
  try {
    const { rows } = await db.query<{
      body: string; sender_slug: string; subject: string;
    }>(
      `SELECT tm.body, tm.sender_slug, t.subject
       FROM thread_messages tm
       JOIN threads t ON t.thread_id = tm.thread_id
       WHERE tm.message_id = $1`,
      [messageId],
    );
    if (rows[0]) {
      message_body    = rows[0].body;
      message_from    = rows[0].sender_slug;
      message_subject = rows[0].subject;
    }
  } catch (e: any) {
    console.warn(`[reply-broadcaster] failed to fetch message details for ${messageId}: ${e?.message}`);
  }

  // Push to the target agent over its existing WebSocket connection
  pushToAgent(targetAgentId, "reply_required", {
    event_id:        eventId,
    thread_id:       threadId,
    message_id:      messageId,
    target_agent_id: targetAgentId,
    reason:          payload.reason ?? "all_participants",
    created_at:      payload.created_at ?? new Date().toISOString(),
    // Message context — required by handleNotification in the plugin
    message_body,
    message_from,
    message_subject,
  });

  await client.xAck(STREAM_KEY, CONSUMER_GROUP, msg.id).catch(() => {});
  console.info(`[reply-broadcaster] pushed reply_required → agent ${targetAgentId} thread ${threadId} from=${message_from}`);
}

export function stopThreadReplyRequiredBroadcaster() {
  running = false;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
