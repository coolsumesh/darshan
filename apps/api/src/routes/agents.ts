import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";
import { broadcast, pushToAgent } from "../broadcast.js";
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

    }

    return {
      ok: true,
      agent_id: agent.id,
      callback_token: token,
      welcome: {
        agent_id: agent.id, token,
        message: `Welcome to Darshan, ${name}! Paste the heartbeat_config block into your OpenClaw HEARTBEAT.md.`,
        heartbeat_config: endpoint_type === "openclaw_poll"
          ? `## Darshan Agent — ${name}\nAGENT_ID: ${agent.id}\nTOKEN: ${token}\nBASE: https://darshan.caringgems.in/api/backend/api/v1\n\n### Heartbeat steps:\n1. GET /agents/${agent.id}/tasks?status=approved  (Authorization: Bearer ${token})\n2. GET /notifications                               (Authorization: Bearer ${token})\n3. Process each notification by type:\n   - type=ping  → POST /agents/${agent.id}/pong { token }\n   - type=message → read body, respond via POST /threads/direct { to, body }\n4. PATCH task status as you work`
          : null,
      },
    };
  });

  // ── List agents ─────────────────────────────────────────────────────────────
  // ?all=true → returns all agents (for team pickers); default → personal only
  server.get<{ Querystring: { all?: string } }>("/agents", async (req) => {
    const userId  = getRequestUser(req)?.userId ?? null;
    const showAll = req.query.all === "true" && userId !== null;
    const { rows } = await db.query(`
      select a.*,
             case when a.last_ping_at > now() - interval '1 hour' then 'online' else 'offline' end as status,
             (select count(*)::int from threads t
              where t.assignee_agent_id = a.id
                and t.thread_type = 'task'
                and t.status = 'open'
                and t.task_status in ('proposed','approved','in-progress','review','blocked')
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
              (select count(*)::int from threads t
               where t.assignee_agent_id = a.id
                 and t.thread_type = 'task'
                 and t.status = 'open'
                 and t.task_status in ('proposed','approved','in-progress','review','blocked')
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
    await db.query(`delete from agent_invites where agent_id = $1`, [rows[0].id]);
    await db.query(`delete from agents        where id = $1`,       [rows[0].id]);

    broadcast("agent:removed", { agentId: rows[0].id, name: rows[0].name });
    return { ok: true };
  });

  // ── Ping an agent (WS push — no inbox) ────────────────────────────────────
  // Pushes a ping event via WebSocket. Agent responds via POST /agents/:id/pong.
  server.post<{ Params: { id: string } }>("/agents/:id/ping", async (req, reply) => {
    const { rows: agents } = await db.query(
      `select id from agents where id::text = $1`, [req.params.id]
    );
    if (!agents.length) return reply.status(404).send({ ok: false, error: "agent not found" });

    const sentAt = new Date().toISOString();

    await db.query(
      `update agents set ping_status = 'pending', last_ping_sent_at = $2 where id = $1`,
      [agents[0].id, sentAt]
    );

    // Push directly via WS — if agent is offline the ping is simply unanswered
    pushToAgent(agents[0].id, "ping", { sent_at: sentAt });

    broadcast("agent:ping_sent", { agentId: agents[0].id });
    return { ok: true, sent_at: sentAt };
  });

  // ── Agent responds to ping ─────────────────────────────────────────────────
  // Agent calls this immediately after receiving a WS ping event.
  server.post<{ Params: { id: string }; Body: { token: string; sent_at?: string } }>(
    "/agents/:id/pong",
    async (req, reply) => {
      const { token, sent_at } = req.body ?? {};

      const { rows: agents } = await db.query(
        `select id, last_ping_sent_at from agents where id::text = $1 and callback_token = $2`,
        [req.params.id, token]
      );
      if (!agents[0]) return reply.status(401).send({ ok: false, error: "invalid token" });

      // Compute round-trip using sent_at from agent or stored last_ping_sent_at
      const ref = sent_at ?? agents[0].last_ping_sent_at;
      const pingMs = ref ? Math.round(Date.now() - new Date(ref).getTime()) : null;

      await db.query(
        `update agents set
           ping_status = 'ok', last_ping_at = now(), last_seen_at = now(),
           status = 'online', last_ping_ms = $2
         where id = $1`,
        [agents[0].id, pingMs]
      );

      broadcast("agent:ping_ack", { agentId: agents[0].id, pingMs });
      return { ok: true, ping_ms: pingMs };
    }
  );

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

      const conditions = ["t.assignee_agent_id = $1", "t.thread_type = 'task'"];
      const vals: unknown[] = [agents[0].id];

      if (req.query.status) {
        const requestedStatus = req.query.status.trim().toLowerCase();
        if (requestedStatus === "done") {
          conditions.push(`t.status = 'closed'`);
        } else if (requestedStatus === "open") {
          conditions.push(`t.status = 'open'`);
        } else {
          vals.push(requestedStatus);
          conditions.push(`t.task_status = $${vals.length}`);
          conditions.push(`t.status = 'open'`);
        }
      }
      if (req.query.project_id) {
        vals.push(req.query.project_id);
        conditions.push(`t.project_id::text = $${vals.length}`);
      }

      vals.push(Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200));

      const { rows } = await db.query(
        `select
           t.thread_id as id,
           t.thread_id,
           t.project_id,
           t.subject as title,
           first_message.body as description,
           coalesce(t.task_status, case when t.status = 'closed' then 'done' else t.status end) as status,
           t.priority,
           t.completion_note,
           t.done_at as completed_at,
           coalesce(last_message.sent_at, t.created_at) as last_activity
         from threads t
         left join lateral (
           select tm.body
           from thread_messages tm
           where tm.thread_id = t.thread_id and tm.type = 'message'
           order by tm.sent_at asc
           limit 1
         ) first_message on true
         left join lateral (
           select tm.sent_at
           from thread_messages tm
           where tm.thread_id = t.thread_id
           order by tm.sent_at desc
           limit 1
         ) last_message on true
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
