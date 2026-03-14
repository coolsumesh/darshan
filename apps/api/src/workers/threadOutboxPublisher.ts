import type pg from "pg";
import { createClient } from "redis";

const OUTBOX_STREAM = process.env.THREAD_REPLY_REQUIRED_STREAM?.trim() || "darshan:reply_required";
const POLL_MS = Math.max(500, Number(process.env.THREAD_OUTBOX_POLL_MS ?? 1500));
const BATCH_SIZE = Math.max(1, Number(process.env.THREAD_OUTBOX_BATCH_SIZE ?? 50));

let redisClient: any = null;
let running = false;
let timer: NodeJS.Timeout | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
  const client = createClient({ url });
  client.on("error", (err) => {
    console.error("[thread-outbox] redis error", err);
  });
  await client.connect();
  redisClient = client;
  return client;
}

async function publishPendingBatch(db: pg.Pool) {
  const client = await getRedisClient();

  const { rows } = await db.query(
    `SELECT event_id, event_type, thread_id, message_id, target_agent_id, payload, publish_attempts
     FROM thread_event_outbox
     WHERE status IN ('pending', 'failed')
     ORDER BY created_at ASC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  for (const row of rows) {
    try {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      const fields: Record<string, string> = {
        event_id: String(row.event_id),
        event_type: String(row.event_type),
        thread_id: String(row.thread_id),
        message_id: String(row.message_id),
        target_agent_id: String(row.target_agent_id),
        payload: JSON.stringify(payload),
      };

      await client.xAdd(OUTBOX_STREAM, "*", fields);

      await db.query(
        `UPDATE thread_event_outbox
         SET status = 'published',
             published_at = now(),
             publish_attempts = publish_attempts + 1,
             last_error = null
         WHERE event_id = $1`,
        [row.event_id]
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message.slice(0, 800) : "unknown outbox publish error";
      await db.query(
        `UPDATE thread_event_outbox
         SET status = CASE WHEN publish_attempts + 1 >= 10 THEN 'dead_letter' ELSE 'failed' END,
             publish_attempts = publish_attempts + 1,
             last_error = $2
         WHERE event_id = $1`,
        [row.event_id, msg]
      );
    }
  }
}

export async function startThreadOutboxPublisher(db: pg.Pool) {
  if (running) return;
  running = true;

  const loop = async () => {
    if (!running) return;
    try {
      await publishPendingBatch(db);
    } catch (error) {
      console.error("[thread-outbox] batch publish failed", error);
    } finally {
      timer = setTimeout(loop, POLL_MS);
    }
  };

  await loop();
}

export async function stopThreadOutboxPublisher() {
  running = false;
  if (timer) clearTimeout(timer);
  if (redisClient) {
    await redisClient.quit().catch(() => {});
    redisClient = null;
  }
}
