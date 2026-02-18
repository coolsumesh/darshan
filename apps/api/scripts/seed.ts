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

const AGENTS = [
  {
    name: "Mithran",
    status: "online",
    connector_ref: "openclaw:agent:main:agent:main:main",
    capabilities: { role: "coordinator", emoji: "⚡", skills: ["coordination", "planning", "approval"] },
  },
  {
    name: "Komal",
    status: "online",
    connector_ref: "openclaw:agent:komal:agent:komal:main",
    capabilities: { role: "developer", emoji: "🌸", skills: ["frontend", "backend", "typescript"] },
  },
  {
    name: "Anantha",
    status: "offline",
    connector_ref: "",
    capabilities: { role: "systems-architect", emoji: "🐍", skills: ["architecture", "system-design"] },
  },
  {
    name: "Vishwakarma",
    status: "offline",
    connector_ref: "",
    capabilities: { role: "devops", emoji: "🏗️", skills: ["infrastructure", "ci-cd", "cloud"] },
  },
  {
    name: "Ganesha",
    status: "offline",
    connector_ref: "",
    capabilities: { role: "technical-writer", emoji: "📝", skills: ["documentation", "specs"] },
  },
  {
    name: "Drishti",
    status: "offline",
    connector_ref: "",
    capabilities: { role: "product-analyst", emoji: "👁️", skills: ["requirements", "product"] },
  },
  {
    name: "Lekha",
    status: "offline",
    connector_ref: "",
    capabilities: { role: "database-specialist", emoji: "🗄️", skills: ["postgres", "data-modelling"] },
  },
  {
    name: "Sanjaya",
    status: "offline",
    connector_ref: "",
    capabilities: { role: "image-generation", emoji: "🎨", skills: ["image-gen", "design"] },
  },
  {
    name: "Suraksha",
    status: "offline",
    connector_ref: "",
    capabilities: { role: "security-expert", emoji: "🛡️", skills: ["security", "audit", "hardening"] },
  },
] as const;

async function seed() {
  console.log("🌱 Seeding Darshan database...\n");

  // ── Agents ──────────────────────────────────────────────────────────────────
  const agentIds: Record<string, string> = {};

  for (const agent of AGENTS) {
    const { rows } = await db.query(
      `insert into agents (name, status, connector_ref, capabilities)
       values ($1, $2, $3, $4)
       on conflict (lower(name)) do update
         set status = excluded.status,
             connector_ref = excluded.connector_ref,
             capabilities = excluded.capabilities,
             updated_at = now()
       returning id, name`,
      [agent.name, agent.status, agent.connector_ref, JSON.stringify(agent.capabilities)]
    );
    agentIds[agent.name] = rows[0].id;
    console.log(`  ✓ Agent: ${agent.name} (${rows[0].id})`);
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

  // ── A2A routes ──────────────────────────────────────────────────────────────
  const routePairs = [
    { from: "Komal", to: "Mithran", policy: "allowed", notes: "Komal can propose tasks to Mithran for approval" },
    { from: "Mithran", to: "Komal", policy: "allowed", notes: "Mithran can delegate dev tasks to Komal" },
  ] as const;

  console.log("\n  A2A routes:");
  for (const { from, to, policy, notes } of routePairs) {
    if (!agentIds[from] || !agentIds[to]) continue;
    await db.query(
      `insert into a2a_routes (from_agent_id, to_agent_id, policy, notes)
       values ($1, $2, $3, $4)
       on conflict (from_agent_id, to_agent_id)
       do update set policy = excluded.policy, notes = excluded.notes, updated_at = now()`,
      [agentIds[from], agentIds[to], policy, notes]
    );
    console.log(`  ✓ ${from} → ${to}: ${policy}`);
  }

  console.log("\n✅ Seed complete.");
  await db.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
