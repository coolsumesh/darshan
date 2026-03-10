import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";
import { broadcast } from "../broadcast.js";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function registerAgents(server: FastifyInstance, db: pg.Pool) {

  // ── Create personal agent (no org required) ────────────────────────────────
  server.post<{
    Body: {
      name: string; desc?: string; model?: string; provider?: string;
      agent_type?: string; capabilities?: string[]; endpoint_type?: string; platform?: string;
    };
  }>("/agents", async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

    const { name, desc, model, provider, agent_type = "ai_agent",
            capabilities = [], endpoint_type = "openclaw_poll",
            platform = "openclaw" } = req.body ?? {};
    if (!name?.trim()) return reply.status(400).send({ ok: false, error: "name required" });

    const token = randomBytes(32).toString("hex");
    const slug  = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const { rows } = await db.query(
      `insert into agents
         (name, slug, description, status, owner_user_id, agent_type, model, provider,
          capabilities, endpoint_type, endpoint_config, callback_token, ping_status, platform)
       values ($1,$2,$3,'offline',$4,$5,$6,$7,$8,$9,$10,$11,'unknown',$12) returning *`,
      [name.trim(), slug, desc ?? null, user.userId, agent_type,
       model ?? null, provider ?? null, JSON.stringify(capabilities),
       endpoint_type, JSON.stringify({}), token, platform]
    );
    const agent = rows[0];

    if (endpoint_type === "openclaw_poll") {
      const baseUrl = "https://darshan.caringgems.in/api/backend/api/v1";
      const inboxUrl = `${baseUrl}/agents/${agent.id}/inbox`;
      const ackUrl   = `${baseUrl}/agents/${agent.id}/inbox/ack`;
      const heartbeatBlock =
`## Darshan Agent Inbox — ${name}
AGENT_ID: ${agent.id}
TOKEN: ${token}
INBOX_URL: ${inboxUrl}
ACK_URL: ${ackUrl}

### Steps (run on every heartbeat):
1. GET INBOX_URL with header: Authorization: Bearer ${token}
2. GET https://darshan.caringgems.in/api/backend/api/v1/agents/${agent.id}/tasks?status=approved
   with header: Authorization: Bearer ${token}
3. For each pending item:

**type = "ping"**
POST ACK_URL: { inbox_id, callback_token: "${token}", response: "pong — ${name} online" }

**type = "task_assigned"**
Execute the task, then POST ACK_URL: { inbox_id, callback_token: "${token}", response: "done" }

**type = "welcome"**
POST ACK_URL: { inbox_id, callback_token: "${token}", response: "setup complete — ${name} ready" }

**any other type**
POST ACK_URL: { inbox_id, callback_token: "${token}", response: "ack" }`;

      await db.query(
        `insert into agent_inbox (agent_id, type, payload) values ($1, 'welcome', $2)`,
        [agent.id, JSON.stringify({
          message: `Welcome to Darshan, ${name}! Paste the heartbeat_config block into your OpenClaw HEARTBEAT.md.`,
          heartbeat_config: heartbeatBlock,
          agent_id: agent.id, token, inbox_url: inboxUrl, ack_url: ackUrl,
        })]
      );
    }

    return { ok: true, agent_id: agent.id, callback_token: token };
  });

  // ── List agents ─────────────────────────────────────────────────────────────
  // ?all=true → returns all agents (for team pickers); default → personal only
  server.get<{ Querystring: { all?: string } }>("/agents", async (req) => {
    const userId  = getRequestUser(req)?.userId ?? null;
    const showAll = req.query.all === "true" && userId !== null;
    const { rows } = await db.query(`
      select a.*,
             case when a.last_ping_at > now() - interval '1 hour' then 'online' else 'offline' end as status,
             (select count(*)::int from tasks t
              where lower(t.assignee) = lower(a.name)
                and t.status in ('proposed','approved','in-progress','review')
             ) as open_task_count
      from agents a
      where ($1::boolean or $2::uuid is null or a.owner_user_id = $2::uuid)
      order by lower(a.name) asc
    `, [showAll, userId]);
    return { ok: true, agents: rows };
  });

  // ── Agent directory (all agents — for team pickers) ────────────────────────
  server.get("/agents/directory", async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });
    const { rows } = await db.query(`
      select a.id, a.name, a.description, a.agent_type, a.model, a.platform, a.avatar_color,
             case when a.last_ping_at > now() - interval '1 hour' then 'online' else 'offline' end as status
      from agents a
      order by lower(a.name) asc
    `);
    return { ok: true, agents: rows };
  });

  // ── Get single agent ────────────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>("/agents/:id", async (req, reply) => {
    const { rows } = await db.query(
      `select a.*,
              (select count(*)::int from tasks t
               where lower(t.assignee) = lower(a.name)
                 and t.status in ('proposed','approved','in-progress','review')
              ) as open_task_count
       from agents a
       where a.id::text = $1`,
      [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "agent not found" });
    return { ok: true, agent: rows[0] };
  });

  // ── [orgs removed — use /workspaces] ─────────────────────────────────────
  // ── Update agent ────────────────────────────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: {
    name?: string; desc?: string; agent_type?: string;
    model?: string; provider?: string; capabilities?: string[]; endpoint_type?: string; platform?: string;
  } }>("/agents/:id", async (req, reply) => {
    const { rows } = await db.query(
      `select id from agents where id::text = $1`, [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "agent not found" });

    const { name, desc, agent_type, model, provider, capabilities, endpoint_type, platform } = req.body ?? {};
    const fields: string[] = [];
    const vals: unknown[]  = [];
    let i = 1;
    if (name         !== undefined) { fields.push(`name = $${i++}`);          vals.push(name); }
    if (desc         !== undefined) { fields.push(`description = $${i++}`);     vals.push(desc); }
    if (agent_type   !== undefined) { fields.push(`agent_type = $${i++}`);    vals.push(agent_type); }
    if (model        !== undefined) { fields.push(`model = $${i++}`);         vals.push(model); }
    if (provider     !== undefined) { fields.push(`provider = $${i++}`);      vals.push(provider); }
    if (capabilities !== undefined) { fields.push(`capabilities = $${i++}`);  vals.push(JSON.stringify(capabilities)); }
    if (endpoint_type!== undefined) { fields.push(`endpoint_type = $${i++}`); vals.push(endpoint_type); }
    if (platform     !== undefined) { fields.push(`platform = $${i++}`);      vals.push(platform); }
    if (!fields.length) return reply.status(400).send({ ok: false, error: "nothing to update" });

    vals.push(rows[0].id);
    const { rows: updated } = await db.query(
      `update agents set ${fields.join(", ")}, updated_at = now() where id = $${i} returning *`,
      vals
    );
    broadcast("agent:updated", { agentId: rows[0].id });
    return { ok: true, agent: updated[0] };
  });

  server.delete<{ Params: { id: string } }>("/agents/:id", async (req, reply) => {
    const { rows } = await db.query(
      `select id, name from agents where id::text = $1`, [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "agent not found" });

    // Remove from project teams, inbox, invites, org membership, then delete agent
    await db.query(`delete from project_agents  where agent_id = $1`, [rows[0].id]);
    await db.query(`delete from agent_inbox   where agent_id = $1`, [rows[0].id]);
    await db.query(`delete from agent_invites where agent_id = $1`, [rows[0].id]);
    await db.query(`delete from agents        where id = $1`,       [rows[0].id]);

    broadcast("agent:removed", { agentId: rows[0].id, name: rows[0].name });
    return { ok: true };
  });

  // ── Ping an agent ───────────────────────────────────────────────────────────
  server.post<{ Params: { id: string } }>("/agents/:id/ping", async (req, reply) => {
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
    Body: {
      inbox_id: string; callback_token: string; response?: string;
      status?: { model?: string; capabilities?: string[]; provider?: string; version?: string };
    };
  }>("/agents/:id/inbox/ack", async (req, reply) => {
    const { inbox_id, callback_token, response, status } = req.body;

    // Verify token
    const { rows: agents } = await db.query(
      `select * from agents where id::text = $1 and callback_token = $2`,
      [req.params.id, callback_token]
    );
    if (!agents.length) return reply.status(401).send({ ok: false, error: "invalid token" });

    // Get inbox item created_at to compute latency
    const { rows: inboxRows } = await db.query(
      `update agent_inbox set status = 'ack', acked_at = now(),
              payload = payload || $1::jsonb
       where id = $2 and agent_id = $3 returning created_at`,
      [JSON.stringify({ response: response ?? "ok" }), inbox_id, agents[0].id]
    );

    // Compute round-trip latency in ms (time between ping write and ack)
    const pingMs = inboxRows[0]?.created_at
      ? Math.round(Date.now() - new Date(inboxRows[0].created_at).getTime())
      : null;

    // Update agent status with latency + self-reported model/capabilities if provided
    if (status?.model || status?.capabilities || status?.provider) {
      await db.query(
        `update agents set
          ping_status  = 'ok',  last_ping_at = now(), last_seen_at = now(),
          status       = 'online', last_ping_ms = $2,
          model        = coalesce($3, model),
          capabilities = coalesce($4::jsonb, capabilities),
          provider     = coalesce($5, provider)
         where id = $1`,
        [
          agents[0].id, pingMs,
          status.model        ?? null,
          status.capabilities ? JSON.stringify(status.capabilities) : null,
          status.provider     ?? null,
        ]
      );
    } else {
      await db.query(
        `update agents set ping_status = 'ok', last_ping_at = now(), last_seen_at = now(),
                status = 'online', last_ping_ms = $2
         where id = $1`,
        [agents[0].id, pingMs]
      );
    }

    broadcast("agent:ping_ack", { agentId: agents[0].id, response, pingMs, status });
    return { ok: true, ping_ms: pingMs };
  });

  // ── Agent polls its inbox ───────────────────────────────────────────────────
  server.get<{
    Params: { id: string };
    Querystring: { token?: string; status?: string };
  }>("/agents/:id/inbox", async (req, reply) => {
    const { status = "pending" } = req.query;
    // Accept token from Authorization header (preferred) or query string (legacy)
    const token = (req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.query.token) ?? "";

    // Verify token
    const { rows: agents } = await db.query(
      `select id from agents where id::text = $1 and callback_token = $2`,
      [req.params.id, token]
    );
    if (!agents.length) return reply.status(401).send({ ok: false, error: "invalid token" });

    // Update last_seen
    await db.query(`update agents set last_seen_at = now() where id = $1`, [agents[0].id]);

    const { rows } = await db.query(
      status === "all"
        ? `select * from agent_inbox where agent_id = $1 order by created_at desc limit 200`
        : `select * from agent_inbox where agent_id = $1 and status = $2 order by created_at desc limit 200`,
      status === "all" ? [agents[0].id] : [agents[0].id, status]
    );
    return { ok: true, items: rows };
  });

  // ── Projects assigned to an agent ──────────────────────────────────────────
  server.get<{ Params: { id: string } }>("/agents/:id/projects", async (req, reply) => {
    const { rows: agents } = await db.query(
      `select id from agents where id::text = $1`, [req.params.id]
    );
    if (!agents.length) return reply.status(404).send({ ok: false, error: "agent not found" });

    const { rows } = await db.query(
      `select p.id, p.name, p.slug, p.status,
              pt.joined_at
       from project_agents pt
       join projects p on p.id = pt.project_id
       where pt.agent_id = $1
       order by pt.joined_at desc nulls last`,
      [agents[0].id]
    );
    return { ok: true, projects: rows };
  });

  // ── Agent-scoped task feed (for heartbeat pickup loops) ───────────────────
  server.get<{ Params: { id: string }; Querystring: { token?: string; status?: string; project_id?: string; limit?: number } }>(
    "/agents/:id/tasks",
    async (req, reply) => {
      // Support agent callback-token auth (same pattern as inbox polling)
      const token = (req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.query.token) ?? "";

      const { rows: agents } = await db.query(
        `select id, name from agents where id::text = $1 and callback_token = $2 limit 1`,
        [req.params.id, token]
      );
      if (!agents[0]) return reply.status(401).send({ ok: false, error: "invalid token" });

      const conditions = ["lower(t.assignee) = lower($1)"];
      const vals: unknown[] = [agents[0].name];

      if (req.query.status) {
        vals.push(req.query.status);
        conditions.push(`t.status = $${vals.length}`);
      }
      if (req.query.project_id) {
        vals.push(req.query.project_id);
        conditions.push(`t.project_id::text = $${vals.length}`);
      }

      vals.push(Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200));

      const { rows } = await db.query(
        `select t.*
         from tasks t
         where ${conditions.join(" and ")}
         order by
           case t.priority when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
           t.created_at asc
         limit $${vals.length}`,
        vals
      );

      return { ok: true, tasks: rows };
    }
  );

  // ── List agents in a project — agent-token auth ────────────────────────────
  // Allows AI agents to enumerate their project team via callback token.
  // GET /api/v1/projects/:id/agents   Authorization: Bearer <callback_token>
  server.get<{ Params: { id: string } }>(
    "/projects/:id/agents",
    async (req, reply) => {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      if (!token) return reply.status(401).send({ ok: false, error: "agent token required" });

      // Validate the calling agent
      const { rows: callers } = await db.query(
        `SELECT id, name FROM agents WHERE callback_token = $1 LIMIT 1`,
        [token]
      );
      if (!callers[0]) return reply.status(401).send({ ok: false, error: "invalid token" });

      // Resolve project
      const { rows: projects } = await db.query(
        `SELECT id FROM projects WHERE id::text = $1 OR lower(slug) = lower($1)`,
        [req.params.id]
      );
      if (!projects[0]) return reply.status(404).send({ ok: false, error: "project not found" });

      // List all agents in the project
      const { rows } = await db.query(
        `SELECT a.id, a.name, a.slug, a.status, a.description,
                a.agent_type, a.model, a.provider, a.ping_status, a.last_seen_at,
                pa.joined_at
         FROM project_agents pa
         JOIN agents a ON a.id = pa.agent_id
         WHERE pa.project_id = $1
         ORDER BY pa.joined_at ASC`,
        [projects[0].id]
      );

      return { ok: true, agents: rows, count: rows.length };
    }
  );

}