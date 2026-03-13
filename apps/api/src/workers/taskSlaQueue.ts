import { Queue, type ConnectionOptions } from "../vendor/bullmq.js";

export const TASK_SLA_QUEUE_NAME = "task-sla";
export const TASK_PICKUP_SLA_MINUTES = Math.max(1, Number(process.env.TASK_PICKUP_SLA_MINUTES ?? 10));
export const TASK_PROGRESS_SLA_MINUTES = Math.max(1, Number(process.env.TASK_PROGRESS_SLA_MINUTES ?? 30));

export type TaskSlaJobName = "pickup-timeout" | "progress-timeout";

export type TaskSlaJobData = {
  threadId: string;
  dueAt: string;
};

export type TaskSlaStateRow = {
  thread_id: string;
  pickup_due_at: string | null;
  progress_due_at: string | null;
};

let queue: Queue<TaskSlaJobData> | null = null;

function buildRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
  const parsed = new URL(redisUrl);
  const tls = parsed.protocol === "rediss:" ? {} : undefined;
  const db = parsed.pathname && parsed.pathname !== "/" ? Number(parsed.pathname.slice(1)) : undefined;

  return {
    host: parsed.hostname || "127.0.0.1",
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls,
  };
}

export function getTaskSlaConnection(): ConnectionOptions {
  return buildRedisConnection();
}

export function getTaskSlaQueue() {
  if (!queue) {
    queue = new Queue<TaskSlaJobData>(TASK_SLA_QUEUE_NAME, {
      connection: buildRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }
  return queue;
}

function getJobId(name: TaskSlaJobName, threadId: string) {
  return `${name}:${threadId}`;
}

async function upsertJob(name: TaskSlaJobName, threadId: string, dueAt: string) {
  const taskQueue = getTaskSlaQueue();
  const jobId = getJobId(name, threadId);
  const existing = await taskQueue.getJob(jobId);
  if (existing) await existing.remove();

  const delay = Math.max(0, new Date(dueAt).getTime() - Date.now());
  await taskQueue.add(name, { threadId, dueAt }, { jobId, delay });
}

export async function removeTaskSlaJob(name: TaskSlaJobName, threadId: string) {
  const existing = await getTaskSlaQueue().getJob(getJobId(name, threadId));
  if (existing) await existing.remove();
}

export async function syncTaskSlaJobs(state: TaskSlaStateRow) {
  if (state.pickup_due_at) {
    await upsertJob("pickup-timeout", state.thread_id, state.pickup_due_at);
  } else {
    await removeTaskSlaJob("pickup-timeout", state.thread_id);
  }

  if (state.progress_due_at) {
    await upsertJob("progress-timeout", state.thread_id, state.progress_due_at);
  } else {
    await removeTaskSlaJob("progress-timeout", state.thread_id);
  }
}
