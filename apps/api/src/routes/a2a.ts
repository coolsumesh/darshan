import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { randomUUID } from "crypto";

const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "";

/** Resolve the calling agent from either an API key (any agent) or a callback token (specific agent). */
async function resolveCallerAgent(
  db: pg.Pool,
  req: { headers: Record<string, string | string[] | undefined> }
): Promise<{ agentId: string } | null> {
  const auth = (req.headers["authorization"] as string | undefined) ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();

  // Internal API key — caller must pass from_agent_id in body; resolved separately
  if (INTERNAL_API_KEY && token === INTERNAL_API_KEY) return { agentId: "__internal__" };

  // Agent callback token
  const { rows } = await db.query(
    `select id from agents where callback_token = $1 limit 1`,
    [token]
  );
  if (!rows.length) return null;
  return { agentId: rows[0].id };
}

export async function registerA2A(server: FastifyInstance, db: pg.Pool) {

  // ── GET /api/v1/a2a/routes ──────────────────────────────────────────────────
  server.get("/api/v1/a2a/routes", async () => {
    const { rows } = await db.query(
      `select r.*,
              fa.name as from_agent_name,
              ta.name as to_agent_name
       from a2a_routes r
       join agents fa on fa.id = r.from_agent_id
       join agents ta on ta.id = r.to_agent_id
       order by fa.name asc, ta.name asc`
    );
    return { ok: true, routes: rows };
  });

  // ── POST /api/v1/a2a/routes ─────────────────────────────────────────────────
  server.post<{
    Body: {
      from_agent_id: string;
      to_agent_id: string;
      policy: "allowed" | "blocked" | "requires_human_approval";
      notes?: string;
    };
  }>("/api/v1/a2a/routes", async (req, reply) => {
    const { from_agent_id, to_agent_id, policy, notes } = req.body ?? {};

    if (!from_agent_id || !to_agent_id || !policy) {
      return reply.status(400).send({
        ok: false,
        error: "from_agent_id, to_agent_id, and policy are required",
      });
    }

    if (from_agent_id === to_agent_id) {
      return reply.status(400).send({
        ok: false,
        error: "from_agent_id and to_agent_id must differ",
      });
    }

    const { rows } = await db.query(
      `insert into a2a_routes (from_agent_id, to_agent_id, policy, notes)
       values ($1, $2, $3, $4)
       on conflict (from_agent_id, to_agent_id)
       do update set policy = excluded.policy, notes = excluded.notes, updated_at = now()
       returning *`,
      [from_agent_id, to_agent_id, policy, notes ?? null]
    );

    return { ok: true, route: rows[0] };
  });

  // ── POST /api/v1/a2a/send ───────────────────────────────────────────────────
  // Send a message from one agent to another via Darshan inbox.
  // Auth: Bearer <INTERNAL_API_KEY>  or  Bearer <agent callback token>
  // Body: { from_agent_id, to_agent_id, text, thread_id?, corr_id?, reply_to_corr_id? }
  server.post<{
    Body: {
      from_agent_id: string;
      to_agent_id: string;
      text: string;
      thread_id?: string;
      corr_id?: string;
      reply_to_corr_id?: string;
    };
  }>("/api/v1/a2a/send", async (req, reply) => {
    const caller = await resolveCallerAgent(db, req as Parameters<typeof resolveCallerAgent>[1]);
    if (!caller) return reply.status(401).send({ ok: false, error: "unauthorized" });

    const { from_agent_id, to_agent_id, text, thread_id, corr_id: inCorr, reply_to_corr_id } = req.body ?? {};
    if (!from_agent_id || !to_agent_id || !text?.trim()) {
      return reply.status(400).send({ ok: false, error: "from_agent_id, to_agent_id, and text are required" });
    }

    // If called with a callback token, ensure from_agent_id matches the token owner
    if (caller.agentId !== "__internal__" && caller.agentId !== from_agent_id) {
      return reply.status(403).send({ ok: false, error: "from_agent_id must match authenticated agent" });
    }

    // Verify both agents exist
    const { rows: agentRows } = await db.query(
      `select id, name from agents where id = any($1)`,
      [[from_agent_id, to_agent_id]]
    );
    if (agentRows.length < 2) {
      return reply.status(404).send({ ok: false, error: "one or both agents not found" });
    }
    const fromAgent = agentRows.find((a: { id: string }) => a.id === from_agent_id);
    const toAgent   = agentRows.find((a: { id: string }) => a.id === to_agent_id);

    // Check route policy
    const { rows: routeRows } = await db.query(
      `select policy from a2a_routes where from_agent_id = $1 and to_agent_id = $2 limit 1`,
      [from_agent_id, to_agent_id]
    );
    const policy = routeRows[0]?.policy ?? "blocked";
    if (policy === "blocked") {
      return reply.status(403).send({ ok: false, error: `a2a route ${fromAgent?.name} → ${toAgent?.name} is blocked. Create a route first.` });
    }
    if (policy === "requires_human_approval") {
      return reply.status(403).send({ ok: false, error: `a2a route ${fromAgent?.name} → ${toAgent?.name} requires human approval.` });
    }

    // Generate corr_id if not provided
    const corr_id = inCorr ?? `a2a-${randomUUID()}`;

    // Insert into target agent's inbox
    const { rows: inboxRows } = await db.query(
      `insert into agent_inbox
         (agent_id, type, payload, from_agent_id, corr_id, reply_to_corr_id, thread_id)
       values ($1, 'a2a_message', $2, $3, $4, $5, $6)
       returning id, corr_id, created_at`,
      [
        to_agent_id,
        JSON.stringify({ text: text.trim(), from_agent_name: fromAgent?.name }),
        from_agent_id,
        corr_id,
        reply_to_corr_id ?? null,
        thread_id ?? null,
      ]
    );

    const item = inboxRows[0];
    return {
      ok: true,
      inbox_id: item.id,
      corr_id: item.corr_id,
      from_agent_id,
      to_agent_id,
      thread_id: thread_id ?? null,
    };
  });

  // ── GET /api/v1/a2a/thread/:thread_id ──────────────────────────────────────
  // Retrieve all messages in a thread (for replay/audit).
  server.get<{ Params: { thread_id: string } }>(
    "/api/v1/a2a/thread/:thread_id",
    async (req, reply) => {
      const caller = await resolveCallerAgent(db, req as Parameters<typeof resolveCallerAgent>[1]);
      if (!caller) return reply.status(401).send({ ok: false, error: "unauthorized" });

      const { thread_id } = req.params;
      const { rows } = await db.query(
        `select i.*,
                fa.name as from_agent_name,
                a.name  as to_agent_name
         from agent_inbox i
         join agents a on a.id = i.agent_id
         left join agents fa on fa.id = i.from_agent_id
         where i.thread_id = $1
         order by i.created_at asc`,
        [thread_id]
      );
      return { ok: true, thread_id, messages: rows };
    }
  );
}
