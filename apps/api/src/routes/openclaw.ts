/**
 * OpenClaw native channel endpoints.
 * Allows OpenClaw to poll for pending runs and post replies natively.
 */
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { broadcast } from "../broadcast.js";
import { appendAuditEvent } from "../audit.js";

const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "";

function checkAuth(req: any, reply: any): boolean {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== INTERNAL_API_KEY) {
    reply.status(401).send({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

export async function openclawRoutes(app: FastifyInstance, db: pg.Pool) {
  // GET /api/v1/openclaw/pending
  // Returns queued runs with message content for OpenClaw to process
  app.get("/api/v1/openclaw/pending", async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const { rows } = await db.query<{
      run_id: string;
      thread_id: string;
      agent_id: string;
      agent_name: string;
      message_id: string | null;
      content: string | null;
      requested_by_user_id: string | null;
    }>(
      `select
         r.id as run_id,
         r.thread_id,
         r.target_agent_id as agent_id,
         a.name as agent_name,
         r.input_message_id as message_id,
         m.content,
         r.requested_by_user_id
       from runs r
       join agents a on a.id = r.target_agent_id
       left join messages m on m.id = r.input_message_id
       where r.status = 'queued'
       order by r.seq asc
       limit 10`
    );
    return reply.send({ ok: true, runs: rows });
  });

  // POST /api/v1/openclaw/claim/:runId
  // Claim a queued run (set to running)
  app.post<{ Params: { runId: string } }>(
    "/api/v1/openclaw/claim/:runId",
    async (req, reply) => {
      if (!checkAuth(req, reply)) return;
      const { runId } = req.params;
      const { rows } = await db.query(
        `update runs set status = 'running', started_at = now(), updated_at = now()
         where id = $1 and status = 'queued'
         returning *`,
        [runId]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "run not found or not queued" });
      const { rows: agentRows } = await db.query(
        `select name from agents where id = $1`,
        [rows[0].target_agent_id]
      );
      const run = { ...rows[0], target_agent_name: agentRows[0]?.name };
      broadcast("run.updated", { run });
      return reply.send({ ok: true, run });
    }
  );

  // POST /api/v1/openclaw/reply
  // Post agent reply and mark run done
  app.post<{
    Body: {
      run_id: string;
      thread_id: string;
      agent_id: string;
      agent_name: string;
      text: string;
    };
  }>("/api/v1/openclaw/reply", async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const { run_id, thread_id, agent_id, agent_name, text } = req.body;
    if (!run_id || !thread_id || !agent_id || !text?.trim()) {
      return reply.status(400).send({ ok: false, error: "invalid payload" });
    }

    const responseContent = `[${agent_name}] ${text.trim()}`;

    // Insert agent reply message
    const { rows: msgRows } = await db.query(
      `insert into messages (thread_id, author_type, author_agent_id, content, run_id)
       values ($1, 'agent', $2, $3, $4)
       returning *`,
      [thread_id, agent_id, responseContent, run_id]
    );
    const agentMessage = msgRows[0];

    // Mark run done
    const { rows: doneRows } = await db.query(
      `update runs set status = 'succeeded', ended_at = now(), updated_at = now()
       where id = $1 returning *`,
      [run_id]
    );
    const doneRun = doneRows[0];

    // Update thread updated_at
    await db.query(`update threads set updated_at = now() where id = $1`, [thread_id]);

    await appendAuditEvent(db, {
      actor: { actor_type: "system" },
      action: "run.complete",
      resource_type: "run",
      resource_id: run_id,
      thread_id,
      run_id,
      decision: "allow",
    });

    broadcast("message.created", { message: agentMessage });
    broadcast("run.updated", { run: doneRun });

    return reply.send({ ok: true, message: agentMessage });
  });
}
