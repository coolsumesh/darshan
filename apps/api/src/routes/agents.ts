import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { broadcast } from "../broadcast.js";

export async function registerAgents(server: FastifyInstance, db: pg.Pool) {

  // ── List all agents (with org info) ────────────────────────────────────────
  server.get("/api/v1/agents", async () => {
    const { rows } = await db.query(`
      select a.*,
             o.name  as org_name,
             o.slug  as org_slug,
             o.type  as org_type
      from agents a
      left join organisations o on o.id = a.org_id
      order by o.type asc, lower(a.name) asc
    `);
    return { ok: true, agents: rows };
  });

  // ── Get single agent ────────────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>("/api/v1/agents/:id", async (req, reply) => {
    const { rows } = await db.query(
      `select a.*, o.name as org_name, o.slug as org_slug
       from agents a left join organisations o on o.id = a.org_id
       where a.id::text = $1`,
      [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "agent not found" });
    return { ok: true, agent: rows[0] };
  });

  // ── List organisations ──────────────────────────────────────────────────────
  server.get("/api/v1/orgs", async () => {
    const { rows: orgs } = await db.query(
      `select o.*,
              count(distinct a.id)::int as agent_count,
              count(distinct p.id)::int as project_count
       from organisations o
       left join agents   a on a.org_id = o.id
       left join projects p on p.org_id = o.id
       group by o.id
       order by o.type asc, o.name asc`
    );
    return { ok: true, orgs };
  });

  // ── Create / invite partner org ─────────────────────────────────────────────
  server.post<{ Body: { name: string; slug: string; description?: string; type?: string } }>(
    "/api/v1/orgs",
    async (req, reply) => {
      const { name, slug, description, type = "partner" } = req.body;
      if (!name || !slug) return reply.status(400).send({ ok: false, error: "name and slug required" });
      const { rows } = await db.query(
        `insert into organisations (name, slug, description, type)
         values ($1, $2, $3, $4) returning *`,
        [name, slug, description ?? null, type]
      );
      return { ok: true, org: rows[0] };
    }
  );

  // ── List agents for an org ──────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>("/api/v1/orgs/:id/agents", async (req) => {
    const { rows } = await db.query(
      `select * from agents where org_id::text = $1 order by lower(name) asc`,
      [req.params.id]
    );
    return { ok: true, agents: rows };
  });

  // ── Onboard a new agent under an org ───────────────────────────────────────
  server.post<{
    Params: { id: string };
    Body: {
      name: string; desc?: string; model?: string; provider?: string;
      agent_type?: string; capabilities?: string[]; endpoint_type?: string; endpoint_config?: object;
    };
  }>("/api/v1/orgs/:id/agents", async (req, reply) => {
    const { name, desc, model, provider, agent_type = "ai_agent", capabilities = [], endpoint_type = "openclaw_poll", endpoint_config = {} } = req.body;
    if (!name) return reply.status(400).send({ ok: false, error: "name required" });

    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const { rows } = await db.query(
      `insert into agents (name, desc, status, org_id, agent_type, model, provider, capabilities, endpoint_type, endpoint_config, callback_token, ping_status)
       values ($1,$2,'offline',$3,$4,$5,$6,$7,$8,$9,$10,'unknown') returning *`,
      [name, desc ?? null, req.params.id, agent_type, model ?? null, provider ?? null,
       JSON.stringify(capabilities), endpoint_type, JSON.stringify(endpoint_config), token]
    );
    return { ok: true, agent: rows[0] };
  });

  // ── Ping an agent ───────────────────────────────────────────────────────────
  server.post<{ Params: { id: string } }>("/api/v1/agents/:id/ping", async (req, reply) => {
    // Find agent
    const { rows: agents } = await db.query(
      `select * from agents where id::text = $1`, [req.params.id]
    );
    if (!agents.length) return reply.status(404).send({ ok: false, error: "agent not found" });

    // Write ping to inbox
    const { rows } = await db.query(
      `insert into agent_inbox (agent_id, type, payload)
       values ($1, 'ping', $2) returning *`,
      [agents[0].id, JSON.stringify({ sent_at: new Date().toISOString(), from: "darshan" })]
    );

    // Mark ping as pending on agent record
    await db.query(
      `update agents set ping_status = 'pending' where id = $1`, [agents[0].id]
    );

    broadcast("agent:ping_sent", { agentId: agents[0].id });
    return { ok: true, inbox_item: rows[0] };
  });

  // ── Agent acknowledges inbox item (Mithran calls this) ─────────────────────
  server.post<{
    Params: { id: string };
    Body: { inbox_id: string; callback_token: string; response?: string };
  }>("/api/v1/agents/:id/inbox/ack", async (req, reply) => {
    const { inbox_id, callback_token, response } = req.body;

    // Verify token
    const { rows: agents } = await db.query(
      `select * from agents where id::text = $1 and callback_token = $2`,
      [req.params.id, callback_token]
    );
    if (!agents.length) return reply.status(401).send({ ok: false, error: "invalid token" });

    // Mark inbox item as acked
    await db.query(
      `update agent_inbox set status = 'ack', acked_at = now(),
              payload = payload || $1::jsonb
       where id = $2 and agent_id = $3`,
      [JSON.stringify({ response: response ?? "ok" }), inbox_id, agents[0].id]
    );

    // Update agent status
    await db.query(
      `update agents set ping_status = 'ok', last_ping_at = now(), last_seen_at = now(), status = 'online'
       where id = $1`,
      [agents[0].id]
    );

    broadcast("agent:ping_ack", { agentId: agents[0].id, response });
    return { ok: true };
  });

  // ── Agent polls its inbox ───────────────────────────────────────────────────
  server.get<{
    Params: { id: string };
    Querystring: { token: string; status?: string };
  }>("/api/v1/agents/:id/inbox", async (req, reply) => {
    const { token, status = "pending" } = req.query;

    // Verify token
    const { rows: agents } = await db.query(
      `select id from agents where id::text = $1 and callback_token = $2`,
      [req.params.id, token]
    );
    if (!agents.length) return reply.status(401).send({ ok: false, error: "invalid token" });

    // Update last_seen
    await db.query(`update agents set last_seen_at = now() where id = $1`, [agents[0].id]);

    const { rows } = await db.query(
      `select * from agent_inbox where agent_id = $1 and status = $2 order by created_at asc`,
      [agents[0].id, status]
    );
    return { ok: true, items: rows };
  });
}
