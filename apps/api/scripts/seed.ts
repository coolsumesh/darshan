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
    name: "Mira",
    status: "online",
    connector_ref: "clawdbot://mira",
    capabilities: { role: "ops-triage", skills: ["monitoring", "alerting", "escalation"] },
  },
  {
    name: "Nia",
    status: "online",
    connector_ref: "clawdbot://nia",
    capabilities: { role: "support", skills: ["customer-queries", "ticket-routing"] },
  },
  {
    name: "Kaito",
    status: "online",
    connector_ref: "clawdbot://kaito",
    capabilities: { role: "incident-response", skills: ["diagnosis", "runbooks", "post-mortems"] },
  },
  {
    name: "Anya",
    status: "online",
    connector_ref: "clawdbot://anya",
    capabilities: { role: "qa", skills: ["test-review", "regression", "quality-gates"] },
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

  console.log("\n✅ Seed complete.");
  await db.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
