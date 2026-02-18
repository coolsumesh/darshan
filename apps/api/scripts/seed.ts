/**
 * Seed script — idempotent, safe to re-run.
 * Seeds projects, tasks, and project_team only.
 * Agents are pre-existing in the live DB and are not touched.
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

async function seed() {
  console.log("🌱 Seeding Darshan database...\n");

  // ── Projects ─────────────────────────────────────────────────────────────────
  const PROJECTS = [
    { slug: "darshan", name: "Darshan", description: "Multi-agent project management platform — dashboards, sprint boards, and team coordination.", status: "active", progress: 42 },
    { slug: "alpha",   name: "Alpha Analytics", description: "Analytics pipeline for product telemetry and real-time reporting.", status: "active", progress: 68 },
    { slug: "beta",    name: "Beta Platform", description: "Platform MVP with auth, real-time data, and agent coordination.", status: "planned", progress: 12 },
  ] as const;

  console.log("  Projects:");
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
    console.log(`  ✓ ${p.name} (${rows[0].id})`);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────────
  const TASKS = [
    { project: "darshan", title: "Define MVP scope",            description: "Finalise feature list and acceptance criteria for the MVP release.",        status: "done",        proposer: "Mithran", assignee: "Komal"   },
    { project: "darshan", title: "Design dashboard cards",      description: "Create project card component with status, progress, and team indicators.", status: "in-progress", proposer: "Komal",   assignee: "Mithran" },
    { project: "darshan", title: "Build Sprint Board Kanban",   description: "Implement drag-and-drop Kanban columns with task cards.",                   status: "approved",    proposer: "Anantha", assignee: "Komal"   },
    { project: "darshan", title: "Team tab with Add Agent flow", description: "Inline Agent Registry panel accessible from the Team tab.",                status: "proposed",    proposer: "Mithran", assignee: null      },
    { project: "alpha",   title: "Ingest telemetry pipeline",   description: "Set up data ingestion for product events.",                                 status: "done",        proposer: "Mithran", assignee: "Anantha" },
    { project: "alpha",   title: "Create data schema",          description: "Define normalised schema for telemetry events.",                            status: "in-progress", proposer: "Anantha", assignee: "Mithran" },
    { project: "beta",    title: "OAuth2 auth flow",            description: "Implement OAuth2 login and session management.",                            status: "proposed",    proposer: "Komal",   assignee: null      },
  ] as const;

  console.log("\n  Tasks:");
  for (const t of TASKS) {
    await db.query(
      `insert into tasks (project_id, title, description, status, proposer, assignee)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing`,
      [projectIds[t.project], t.title, t.description, t.status, t.proposer, t.assignee ?? null]
    );
    console.log(`  ✓ [${t.status}] ${t.title}`);
  }

  // ── Project team (use real agents by slug) ────────────────────────────────────
  const { rows: agents } = await db.query(`select id, slug from agents`);
  const agentBySlug: Record<string, string> = {};
  for (const a of agents) agentBySlug[a.slug] = a.id;

  const TEAM = [
    { project: "darshan", slug: "mithran", role: "Coordinator"   },
    { project: "darshan", slug: "komal",   role: "Product & UX"  },
    { project: "darshan", slug: "anantha", role: "Backend"        },
    { project: "alpha",   slug: "mithran", role: "Lead"           },
    { project: "alpha",   slug: "anantha", role: "Data Engineer"  },
    { project: "beta",    slug: "komal",   role: "Product"        },
  ] as const;

  console.log("\n  Project team:");
  for (const m of TEAM) {
    const agentId = agentBySlug[m.slug];
    if (!agentId) { console.log(`  ⚠ Agent '${m.slug}' not found — skipping`); continue; }
    await db.query(
      `insert into project_team (project_id, agent_id, role)
       values ($1, $2, $3)
       on conflict (project_id, agent_id) do update set role = excluded.role`,
      [projectIds[m.project], agentId, m.role]
    );
    console.log(`  ✓ ${m.slug} → ${m.project} (${m.role})`);
  }

  console.log("\n✅ Seed complete.");
  await db.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
