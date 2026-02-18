import type pg from "pg";
import { appendAuditEvent } from "./audit.js";
import { broadcast } from "./broadcast.js";

const POLL_INTERVAL_MS = 2000;
const THINK_TIME_MS = 1500;

const CANNED_RESPONSES: Record<string, string> = {
  default: "Acknowledged. I've reviewed your message and will proceed accordingly.",
  mira: "Got it. I've triaged this and flagged the relevant ops items for follow-up.",
  nia: "Thanks for reaching out. I've logged this and will follow up with the appropriate team.",
  kaito: "Understood. I'm assessing the incident now and will report back shortly.",
  anya: "Received. Running quality checks on this now — I'll have results for you soon.",
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function pickResponse(agentName: string): string {
  const key = agentName.toLowerCase();
  return CANNED_RESPONSES[key] ?? CANNED_RESPONSES["default"]!;
}

export async function processQueued(db: pg.Pool) {
  // Claim queued runs (limit to small batch to avoid thundering herd)
  const { rows: queued } = await db.query<{
    id: string;
    thread_id: string;
    target_agent_id: string;
    requested_by_user_id: string | null;
    input_message_id: string | null;
  }>(
    `update runs
     set status = 'running', started_at = now(), updated_at = now()
     where id in (
       select id from runs
       where status = 'queued'
       order by seq asc
       limit 10
       for update skip locked
     )
     returning id, thread_id, target_agent_id, requested_by_user_id, input_message_id`
  );

  for (const run of queued) {
    // Fetch updated run + agent name for broadcast
    const { rows: runRows } = await db.query(
      `select r.*, a.name as target_agent_name
       from runs r join agents a on a.id = r.target_agent_id
       where r.id = $1`,
      [run.id]
    );
    const updatedRun = runRows[0];
    broadcast("run.updated", { run: updatedRun });

    await appendAuditEvent(db, {
      actor: { actor_type: "system" },
      action: "run.start",
      resource_type: "run",
      resource_id: run.id,
      thread_id: run.thread_id,
      run_id: run.id,
      decision: "allow",
    });

    // Simulate agent thinking
    await sleep(THINK_TIME_MS);

    // Fetch agent name for canned response
    const { rows: agentRows } = await db.query(
      `select name from agents where id = $1`,
      [run.target_agent_id]
    );
    const agentName = agentRows[0]?.name ?? "Agent";
    const responseContent = `[${agentName}] ${pickResponse(agentName)}`;

    // Persist agent response message
    const { rows: msgRows } = await db.query(
      `insert into messages
         (thread_id, author_type, author_agent_id, content, run_id)
       values ($1, 'agent', $2, $3, $4)
       returning *`,
      [run.thread_id, run.target_agent_id, responseContent, run.id]
    );
    const agentMessage = msgRows[0];

    // Mark run succeeded
    const { rows: doneRows } = await db.query(
      `update runs
       set status = 'succeeded', ended_at = now(), updated_at = now()
       where id = $1
       returning *`,
      [run.id]
    );
    const doneRun = doneRows[0];

    // Update thread updated_at
    await db.query(
      `update threads set updated_at = now() where id = $1`,
      [run.thread_id]
    );

    await appendAuditEvent(db, {
      actor: { actor_type: "system" },
      action: "run.complete",
      resource_type: "run",
      resource_id: run.id,
      thread_id: run.thread_id,
      run_id: run.id,
      decision: "allow",
    });

    broadcast("message.created", { message: agentMessage });
    broadcast("run.updated", { run: doneRun });
  }
}

export function startConnector(db: pg.Pool) {
  async function poll() {
    try {
      await processQueued(db);
    } catch {
      // Swallow errors; log via Fastify logger not available here
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  }
  setTimeout(poll, POLL_INTERVAL_MS);
}
