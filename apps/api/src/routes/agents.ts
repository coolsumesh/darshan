import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { broadcast } from "../broadcast.js";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, extname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
              count(distinct p.id)::int as project_count,
              count(distinct a.id) filter (where a.status = 'online')::int as online_count
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

  // ── Get single org with agents + projects ──────────────────────────────────
  server.get<{ Params: { id: string } }>("/api/v1/orgs/:id", async (req, reply) => {
    const { rows } = await db.query(
      `select o.*,
              count(distinct a.id)::int  as agent_count,
              count(distinct p.id)::int  as project_count,
              count(distinct a.id) filter (where a.status = 'online')::int as online_count
       from organisations o
       left join agents   a on a.org_id = o.id
       left join projects p on p.org_id = o.id
       where o.id::text = $1 or o.slug = $1
       group by o.id`,
      [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "org not found" });
    return { ok: true, org: rows[0] };
  });

  // ── Update org ──────────────────────────────────────────────────────────────
  server.patch<{
    Params: { id: string };
    Body: { name?: string; slug?: string; description?: string; type?: string; status?: string; avatar_color?: string };
  }>("/api/v1/orgs/:id", async (req, reply) => {
    const { name, slug, description, type, status, avatar_color } = req.body;
    const { rows } = await db.query(
      `update organisations set
         name         = coalesce($2, name),
         slug         = coalesce($3, slug),
         description  = coalesce($4, description),
         type         = coalesce($5, type),
         status       = coalesce($6, status),
         avatar_color = coalesce($7, avatar_color),
         updated_at   = now()
       where id::text = $1 or slug = $1
       returning *`,
      [req.params.id, name ?? null, slug ?? null, description ?? null, type ?? null, status ?? null, avatar_color ?? null]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "org not found" });
    return { ok: true, org: rows[0] };
  });

  // ── Delete org (only if 0 agents) ──────────────────────────────────────────
  server.delete<{ Params: { id: string } }>("/api/v1/orgs/:id", async (req, reply) => {
    const { rows } = await db.query(
      `select o.id, count(a.id)::int as agent_count
       from organisations o left join agents a on a.org_id = o.id
       where o.id::text = $1 or o.slug = $1 group by o.id`,
      [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "org not found" });
    if (rows[0].agent_count > 0) return reply.status(409).send({ ok: false, error: "Cannot delete org with agents assigned. Remove agents first." });
    await db.query(`delete from organisations where id = $1`, [rows[0].id]);
    return { ok: true };
  });

  // ── Projects linked to an org (via agents in project_team) ─────────────────
  server.get<{ Params: { id: string } }>("/api/v1/orgs/:id/projects", async (req, reply) => {
    const { rows: orgs } = await db.query(
      `select id from organisations where id::text = $1 or slug = $1`, [req.params.id]
    );
    if (!orgs.length) return reply.status(404).send({ ok: false, error: "org not found" });
    const { rows } = await db.query(
      `select distinct p.id, p.name, p.slug, p.status, p.progress
       from projects p
       join project_team pt on pt.project_id = p.id
       join agents a        on a.id = pt.agent_id
       where a.org_id = $1
       order by p.name asc`,
      [orgs[0].id]
    );
    return { ok: true, projects: rows };
  });

  // ── List agents for an org (via org_members, ai_agent type only) ───────────
  server.get<{ Params: { id: string } }>("/api/v1/orgs/:id/agents", async (req, reply) => {
    const { rows: orgs } = await db.query(
      `select id from organisations where id::text = $1 or slug = $1`, [req.params.id]
    );
    if (!orgs.length) return reply.status(404).send({ ok: false, error: "org not found" });
    const { rows } = await db.query(
      `select a.id, a.name, a.status, a.agent_type, a.model, a.provider,
              a.capabilities, a.ping_status, a.last_seen_at, a.org_id,
              om.role as member_role
       from org_members om
       join agents a on a.id = om.agent_id
       where om.org_id = $1 and a.agent_type = 'ai_agent'
       order by lower(a.name) asc`,
      [orgs[0].id]
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

  // ── Delete / remove an agent ───────────────────────────────────────────────
  server.delete<{ Params: { id: string } }>("/api/v1/agents/:id", async (req, reply) => {
    const { rows } = await db.query(
      `select id, name from agents where id::text = $1`, [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "agent not found" });

    // Remove from project teams, clear inbox, then delete agent
    await db.query(`delete from project_team where agent_id = $1`, [rows[0].id]);
    await db.query(`delete from agent_inbox  where agent_id = $1`, [rows[0].id]);
    await db.query(`delete from agents       where id = $1`,       [rows[0].id]);

    broadcast("agent:removed", { agentId: rows[0].id, name: rows[0].name });
    return { ok: true };
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

    // Update agent status with latency
    await db.query(
      `update agents set ping_status = 'ok', last_ping_at = now(), last_seen_at = now(),
              status = 'online', last_ping_ms = $2
       where id = $1`,
      [agents[0].id, pingMs]
    );

    broadcast("agent:ping_ack", { agentId: agents[0].id, response, pingMs });
    return { ok: true, ping_ms: pingMs };
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

  // ── Upload org logo ────────────────────────────────────────────────────────
  server.post<{ Params: { id: string } }>("/api/v1/orgs/:id/logo", async (req, reply) => {
    const { rows } = await db.query(
      `select id, slug, avatar_url from organisations where id::text = $1 or slug = $1`, [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "org not found" });

    const data = await req.file();
    if (!data) return reply.status(400).send({ ok: false, error: "no file uploaded" });

    const allowed = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
    if (!allowed.includes(data.mimetype)) {
      return reply.status(400).send({ ok: false, error: "file must be PNG, JPG, SVG, or WEBP" });
    }

    const ext = data.mimetype === "image/svg+xml" ? ".svg"
      : data.mimetype === "image/webp" ? ".webp"
      : data.mimetype === "image/png"  ? ".png" : ".jpg";

    const filename = `${rows[0].id}${ext}`;
    const uploadsDir = join(__dirname, "..", "..", "uploads", "logos");
    const filePath   = join(uploadsDir, filename);

    const buf = await data.toBuffer();
    writeFileSync(filePath, buf);

    const avatar_url = `/uploads/logos/${filename}`;
    await db.query(`update organisations set avatar_url = $1, updated_at = now() where id = $2`, [avatar_url, rows[0].id]);

    return { ok: true, avatar_url };
  });

  // ── Delete org logo ─────────────────────────────────────────────────────────
  server.delete<{ Params: { id: string } }>("/api/v1/orgs/:id/logo", async (req, reply) => {
    const { rows } = await db.query(
      `select id, avatar_url from organisations where id::text = $1 or slug = $1`, [req.params.id]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "org not found" });

    if (rows[0].avatar_url) {
      const filePath = join(__dirname, "..", "..", rows[0].avatar_url);
      if (existsSync(filePath)) unlinkSync(filePath);
    }
    await db.query(`update organisations set avatar_url = null, updated_at = now() where id = $1`, [rows[0].id]);
    return { ok: true };
  });

  // ── List org members ────────────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>("/api/v1/orgs/:id/members", async (req, reply) => {
    const { rows: orgs } = await db.query(
      `select id from organisations where id::text = $1 or slug = $1`, [req.params.id]
    );
    if (!orgs.length) return reply.status(404).send({ ok: false, error: "org not found" });
    const { rows } = await db.query(
      `select om.id, om.role, om.created_at,
              a.id as agent_id, a.name, a.status, a.agent_type, a.model, a.org_id
       from org_members om
       join agents a on a.id = om.agent_id
       where om.org_id = $1
       order by
         case om.role when 'owner' then 0 when 'admin' then 1 else 2 end,
         lower(a.name) asc`,
      [orgs[0].id]
    );
    return { ok: true, members: rows };
  });

  // ── Add / upsert member ─────────────────────────────────────────────────────
  server.post<{
    Params: { id: string };
    Body: { agent_id: string; role?: string };
  }>("/api/v1/orgs/:id/members", async (req, reply) => {
    const { agent_id, role = "member" } = req.body;
    const { rows: orgs } = await db.query(
      `select id from organisations where id::text = $1 or slug = $1`, [req.params.id]
    );
    if (!orgs.length) return reply.status(404).send({ ok: false, error: "org not found" });
    try {
      const { rows } = await db.query(
        `insert into org_members (org_id, agent_id, role)
         values ($1, $2, $3)
         on conflict (org_id, agent_id) do update set role = excluded.role
         returning *`,
        [orgs[0].id, agent_id, role]
      );
      return { ok: true, member: rows[0] };
    } catch {
      return reply.status(400).send({ ok: false, error: "failed to add member" });
    }
  });

  // ── Update member role ──────────────────────────────────────────────────────
  server.patch<{
    Params: { id: string; agentId: string };
    Body: { role: string };
  }>("/api/v1/orgs/:id/members/:agentId", async (req, reply) => {
    const { rows: orgs } = await db.query(
      `select id from organisations where id::text = $1 or slug = $1`, [req.params.id]
    );
    if (!orgs.length) return reply.status(404).send({ ok: false, error: "org not found" });
    const { rows } = await db.query(
      `update org_members set role = $3
       where org_id = $1 and agent_id::text = $2
       returning *`,
      [orgs[0].id, req.params.agentId, req.body.role]
    );
    if (!rows.length) return reply.status(404).send({ ok: false, error: "member not found" });
    return { ok: true, member: rows[0] };
  });

  // ── Remove member ───────────────────────────────────────────────────────────
  server.delete<{ Params: { id: string; agentId: string } }>("/api/v1/orgs/:id/members/:agentId", async (req, reply) => {
    const { rows: orgs } = await db.query(
      `select id from organisations where id::text = $1 or slug = $1`, [req.params.id]
    );
    if (!orgs.length) return reply.status(404).send({ ok: false, error: "org not found" });
    await db.query(
      `delete from org_members where org_id = $1 and agent_id::text = $2`,
      [orgs[0].id, req.params.agentId]
    );
    return { ok: true };
  });

  // ── Projects assigned to an agent ──────────────────────────────────────────
  server.get<{ Params: { id: string } }>("/api/v1/agents/:id/projects", async (req, reply) => {
    const { rows: agents } = await db.query(
      `select id from agents where id::text = $1`, [req.params.id]
    );
    if (!agents.length) return reply.status(404).send({ ok: false, error: "agent not found" });

    const { rows } = await db.query(
      `select p.id, p.name, p.slug, p.status,
              pt.role, pt.assigned_at
       from project_team pt
       join projects p on p.id = pt.project_id
       where pt.agent_id = $1
       order by pt.assigned_at desc nulls last`,
      [agents[0].id]
    );
    return { ok: true, projects: rows };
  });

}
