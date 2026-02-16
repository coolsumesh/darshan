import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";

async function ensureMigrationsTable(db: pg.Pool) {
  await db.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

export async function runMigrations(db: pg.Pool) {
  await ensureMigrationsTable(db);

  const migrationsDir = path.join(process.cwd(), "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const id = file;
    const already = await db.query(
      "select 1 from schema_migrations where id = $1",
      [id]
    );
    if (already.rowCount && already.rowCount > 0) continue;

    const sqlPath = path.join(migrationsDir, file);
    const sql = await readFile(sqlPath, "utf8");

    await db.query("begin");
    try {
      await db.query(sql);
      await db.query("insert into schema_migrations (id) values ($1)", [id]);
      await db.query("commit");
    } catch (err) {
      await db.query("rollback");
      throw err;
    }
  }
}
