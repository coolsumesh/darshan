/**
 * Seed script — idempotent, safe to re-run.
 *
 * Usage:
 *   pnpm --filter @darshan/api seed
 *   # or directly:
 *   tsx scripts/seed.ts
 *
 * Requires DATABASE_URL in environment (or apps/api/.env).
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Agents are seeded from the live DB — no static list needed.

async function seed() {
  console.log("🌱 Seeding Darshan database...\n");

  // ── Agents (read existing — do not overwrite live agent records) ─────────────
  const agentIds: Record<string, string> = {};
  const { rows: existingAgents } = await db.query(`select id, name from agents`);
  for (const a of existingAgents) {
    agentIds[a.name] = a.id;
    console.log(`  ✓ Agent (existing): ${a.name} (${a.id})`);
  }

  // ── Default thread ──────────────────────────────────────────────────────────
  const { rows: existing } = await db.query(
    `select id from threads where title = 'General' and created_by_user_id = 'sumesh' limit 1`
  );

  let threadId: string;
  if (existing.length > 0) {
    threadId = existing[0].id;
    console.log(`\n  ✓ Thread: General (existing: ${threadId})`);
  } else {
    const { rows } = await db.query(
      `insert into threads (title, visibility, created_by_user_id)
       values ('General', 'shared', 'sumesh')
       returning id`,
    );
    threadId = rows[0].id;
    console.log(`\n  ✓ Thread: General (${threadId})`);
  }

  // ── Thread participants ─────────────────────────────────────────────────────
  // Human owner
  await db.query(
    `insert into thread_participants (thread_id, participant_type, user_id, can_read, can_write, can_share)
     values ($1, 'human', 'sumesh', true, true, true)
     on conflict (thread_id, user_id) where participant_type = 'human' do nothing`,
    [threadId]
  );
  console.log(`  ✓ Participant: sumesh (human)`);

  // All agents
  for (const [name, agentId] of Object.entries(agentIds)) {
    await db.query(
      `insert into thread_participants (thread_id, participant_type, agent_id, can_read, can_write)
       values ($1, 'agent', $2, true, true)
       on conflict (thread_id, agent_id) where participant_type = 'agent' do nothing`,
      [threadId, agentId]
    );
    console.log(`  ✓ Participant: ${name} (agent)`);
  }

  // ── A2A routes (sample allowlist) ──────────────────────────────────────────
  const routePairs = [
    { from: "Mira", to: "Kaito", policy: "allowed", notes: "Mira can escalate incidents to Kaito" },
    { from: "Mira", to: "Nia",   policy: "allowed", notes: "Mira can hand off support queries to Nia" },
    { from: "Kaito", to: "Anya", policy: "requires_human_approval", notes: "Incident → QA requires approval" },
  ] as const;

  console.log("\n  A2A routes:");
  for (const { from, to, policy, notes } of routePairs) {
    await db.query(
      `insert into a2a_routes (from_agent_id, to_agent_id, policy, notes)
       values ($1, $2, $3, $4)
       on conflict (from_agent_id, to_agent_id)
       do update set policy = excluded.policy, notes = excluded.notes, updated_at = now()`,
      [agentIds[from], agentIds[to], policy, notes]
    );
    console.log(`  ✓ ${from} → ${to}: ${policy}`);
  }

  // ── Projects ────────────────────────────────────────────────────────────────
  const PROJECTS = [
    { slug: "darshan", name: "Darshan", description: "Multi-agent project management platform — dashboards, sprint boards, and team coordination.", status: "active", progress: 42 },
    { slug: "alpha", name: "Alpha Analytics", description: "Analytics pipeline for product telemetry and real-time reporting.", status: "active", progress: 68 },
    { slug: "beta", name: "Beta Platform", description: "Platform MVP with auth, real-time data, and agent coordination.", status: "planned", progress: 12 },
  ] as const;

  console.log("\n  Projects:");
  const projectIds: Record<string, string> = {};
  for (const p of PROJECTS) {
    const { rows } = await db.query(
      `insert into projects (slug, name, description, status, progress)
       values ($1, $2, $3, $4, $5)
       on conflict (lower(slug)) do update
         set name = excluded.name, description = excluded.description,
             status = excluded.status, progress = excluded.progress, updated_at = now()
       returning id, slug`,
      [p.slug, p.name, p.description, p.status, p.progress]
    );
    projectIds[p.slug] = rows[0].id;
    console.log(`  ✓ Project: ${p.name} (${rows[0].id})`);
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────
  const TASKS = [
    { project: "darshan", title: "Define MVP scope", description: "Finalise feature list and acceptance criteria for the MVP release.", status: "done", proposer: "Mira", assignee: "Kaito" },
    { project: "darshan", title: "Design dashboard cards", description: "Create project card component with status, progress, and team indicators.", status: "in-progress", proposer: "Anya", assignee: "Mira" },
    { project: "darshan", title: "Build Sprint Board Kanban", description: "Implement drag-and-drop Kanban columns with task cards.", status: "approved", proposer: "Kaito", assignee: "Nia" },
    { project: "darshan", title: "Team tab with Add Agent flow", description: "Inline Agent Registry panel accessible from the Team tab.", status: "proposed", proposer: "Mira", assignee: null },
    { project: "alpha", title: "Ingest telemetry pipeline", description: "Set up data ingestion for product events.", status: "done", proposer: "Mira", assignee: "Anya" },
    { project: "alpha", title: "Create data schema", description: "Define normalised schema for telemetry events.", status: "in-progress", proposer: "Kaito", assignee: "Mira" },
    { project: "beta", title: "OAuth2 auth flow", description: "Implement OAuth2 login and session management.", status: "proposed", proposer: "Nia", assignee: null },
  ] as const;

  console.log("\n  Tasks:");
  for (const t of TASKS) {
    await db.query(
      `insert into tasks (project_id, title, description, status, proposer, assignee)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing`,
      [projectIds[t.project], t.title, t.description, t.status, t.proposer, t.assignee]
    );
    console.log(`  ✓ Task: [${t.status}] ${t.title}`);
  }

  // ── Project team (use real agents from DB by slug) ───────────────────────────
  const { rows: realAgents } = await db.query(`select id, slug, name from agents`);
  const realAgentIds: Record<string, string> = {};
  for (const a of realAgents) realAgentIds[a.slug] = a.id;

  const TEAM = [
    { project: "darshan", agentSlug: "mithran", role: "Coordinator" },
    { project: "darshan", agentSlug: "komal",   role: "Product & UX" },
    { project: "darshan", agentSlug: "anantha", role: "Backend" },
    { project: "alpha",   agentSlug: "mithran", role: "Lead" },
    { project: "alpha",   agentSlug: "anantha", role: "Data Engineer" },
    { project: "beta",    agentSlug: "komal",   role: "Product" },
  ] as const;

  console.log("\n  Project team:");
  for (const m of TEAM) {
    const agentId = realAgentIds[m.agentSlug];
    if (!agentId) { console.log(`  ⚠ Agent ${m.agentSlug} not found, skipping`); continue; }
    await db.query(
      `insert into project_team (project_id, agent_id, role)
       values ($1, $2, $3)
       on conflict (project_id, agent_id) do update set role = excluded.role`,
      [projectIds[m.project], agentId, m.role]
    );
    console.log(`  ✓ ${m.agentSlug} → ${m.project} (${m.role})`);
  }

  console.log("\n✅ Seed complete.");
  await db.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
