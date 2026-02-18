/**
 * Darshan Agent Connector — OpenClaw backend
 *
 * Replaces the fake canned-response stub with real agent invocations via
 * the OpenClaw Gateway HTTP API (POST /tools/invoke → sessions_send).
 *
 * connector_ref format stored in agents table:
 *   "openclaw:agent:<agentId>:<sessionKey>"
 *   e.g. "openclaw:agent:main:agent:main:main"
 *        "openclaw:agent:komal:agent:komal:main"
 *
 * The sessionKey is the full OpenClaw session key passed to sessions_send.
 */

import type pg from "pg";
import { appendAuditEvent } from "./audit.js";
import { broadcast } from "./broadcast.js";

const POLL_INTERVAL_MS = 2000;

// OpenClaw Gateway — loopback, same server
const OPENCLAW_URL   = process.env.OPENCLAW_URL   ?? "http://127.0.0.1:18789";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN  ?? "";

// Per-run timeout: how long to wait for an agent reply (ms)
const AGENT_TIMEOUT_SECONDS = 120;

// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw HTTP helper
// ─────────────────────────────────────────────────────────────────────────────

interface OpenClawSendResult {
  ok: boolean;
  reply?: string;
  error?: string;
}

async function sendToAgent(sessionKey: string, message: string): Promise<OpenClawSendResult> {
  try {
    const res = await fetch(`${OPENCLAW_URL}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENCLAW_TOKEN}`,
      },
      body: JSON.stringify({
        tool: "sessions_send",
        args: {
          sessionKey,
          message,
          timeoutSeconds: AGENT_TIMEOUT_SECONDS,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    const data = await res.json() as {
      ok: boolean;
      result?: {
        details?: { runId?: string; status?: string; reply?: string; error?: string };
        content?: Array<{ type: string; text: string }>;
      };
      error?: unknown;
    };

    if (!data.ok) {
      return { ok: false, error: JSON.stringify(data.error ?? "unknown error") };
    }

    // Gateway wraps tool results: real payload is in result.details
    const details = data.result?.details ?? {};

    if (details.status === "error") {
      return { ok: false, error: details.error ?? "agent returned error" };
    }

    if (details.status === "timeout") {
      return { ok: false, error: "agent did not reply in time (timeout)" };
    }

    return { ok: true, reply: details.reply ?? undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse connector_ref → OpenClaw session key
// Format: "openclaw:agent:<agentId>:<fullSessionKey>"
// e.g.   "openclaw:agent:komal:agent:komal:main"
// ─────────────────────────────────────────────────────────────────────────────

function parseConnectorRef(ref: string): string | null {
  if (!ref.startsWith("openclaw:agent:")) return null;
  // Everything after "openclaw:agent:<agentId>:" is the session key
  const parts = ref.split(":");
  // parts: ["openclaw", "agent", "<agentId>", ...rest of session key]
  if (parts.length < 4) return null;
  // Session key starts at index 3
  return parts.slice(3).join(":");
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the message context to send to the agent
// ─────────────────────────────────────────────────────────────────────────────

async function buildAgentMessage(
  db: pg.Pool,
  run: { thread_id: string; input_message_id: string | null }
): Promise<string> {
  // Get the triggering human message
  if (!run.input_message_id) return "(task triggered with no message content)";

  const { rows } = await db.query(
    `select m.content, t.title as thread_title
     from messages m
     join threads t on t.id = m.thread_id
     where m.id = $1`,
    [run.input_message_id]
  );

  if (rows.length === 0) return "(message not found)";

  const { content, thread_title } = rows[0];
  const context = thread_title ? `[Thread: ${thread_title}]\n\n` : "";
  return `${context}${content}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Process queued runs
// ─────────────────────────────────────────────────────────────────────────────

export async function processQueued(db: pg.Pool) {
  // Claim queued runs in batch (skip locked for safe concurrency)
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
       limit 5
       for update skip locked
     )
     returning id, thread_id, target_agent_id, requested_by_user_id, input_message_id`
  );

  for (const run of queued) {
    // Fetch agent details (name + connector_ref)
    const { rows: agentRows } = await db.query(
      `select id, name, connector_ref from agents where id = $1`,
      [run.target_agent_id]
    );
    const agent = agentRows[0];
    const agentName = agent?.name ?? "Agent";

    // Broadcast: run is now running
    const { rows: runRows } = await db.query(
      `select r.*, a.name as target_agent_name
       from runs r join agents a on a.id = r.target_agent_id
       where r.id = $1`,
      [run.id]
    );
    broadcast("run.updated", { run: runRows[0] });

    await appendAuditEvent(db, {
      actor: { actor_type: "system" },
      action: "run.start",
      resource_type: "run",
      resource_id: run.id,
      thread_id: run.thread_id,
      run_id: run.id,
      decision: "allow",
    });

    // ── Invoke the real agent via OpenClaw ──
    let responseContent: string;
    let runStatus: "succeeded" | "failed" = "succeeded";
    let errorMessage: string | undefined;

    const connectorRef = agent?.connector_ref ?? "";
    const sessionKey = parseConnectorRef(connectorRef);

    if (!sessionKey) {
      // No valid connector_ref — agent not yet connected to OpenClaw
      responseContent = `[${agentName}] Not yet connected to OpenClaw (connector_ref missing or invalid: "${connectorRef}"). Set connector_ref to "openclaw:agent:<agentId>:<sessionKey>" in the agents table.`;
      runStatus = "failed";
      errorMessage = "no_connector_ref";
    } else {
      const message = await buildAgentMessage(db, run);
      const result = await sendToAgent(sessionKey, message);

      if (result.ok && result.reply) {
        responseContent = result.reply;
      } else if (result.ok && !result.reply) {
        // Agent ran but returned no text (e.g. NO_REPLY / HEARTBEAT_OK)
        responseContent = `[${agentName}] (no response text returned)`;
        runStatus = "succeeded";
      } else {
        responseContent = `[${agentName}] ${result.error ?? "unknown error"}`;
        runStatus = "failed";
        errorMessage = result.error;
      }
    }

    // Persist agent response as a message
    const { rows: msgRows } = await db.query(
      `insert into messages
         (thread_id, author_type, author_agent_id, content, run_id)
       values ($1, 'agent', $2, $3, $4)
       returning *`,
      [run.thread_id, run.target_agent_id, responseContent, run.id]
    );
    const agentMessage = msgRows[0];

    // Update run status
    const { rows: doneRows } = await db.query(
      `update runs
       set status = $2,
           ended_at = now(),
           updated_at = now(),
           error_code = $3,
           error_message = $4
       where id = $1
       returning *`,
      [run.id, runStatus, runStatus === "failed" ? "connector_error" : null, errorMessage ?? null]
    );
    const doneRun = doneRows[0];

    // Update thread updated_at
    await db.query(`update threads set updated_at = now() where id = $1`, [run.thread_id]);

    await appendAuditEvent(db, {
      actor: { actor_type: "system" },
      action: runStatus === "succeeded" ? "run.complete" : "run.fail",
      resource_type: "run",
      resource_id: run.id,
      thread_id: run.thread_id,
      run_id: run.id,
      decision: runStatus === "succeeded" ? "allow" : "error",
      reason: errorMessage,
    });

    broadcast("message.created", { message: agentMessage });
    broadcast("run.updated", { run: doneRun });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling loop
// ─────────────────────────────────────────────────────────────────────────────

export function startConnector(db: pg.Pool) {
  if (!OPENCLAW_TOKEN) {
    console.warn("[connector] OPENCLAW_TOKEN not set — agent calls will fail. Set it in .env");
  }

  async function poll() {
    try {
      await processQueued(db);
    } catch (err) {
      console.error("[connector] poll error:", err);
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  }

  console.log(`[connector] Starting OpenClaw connector (gateway: ${OPENCLAW_URL})`);
  setTimeout(poll, POLL_INTERVAL_MS);
}
