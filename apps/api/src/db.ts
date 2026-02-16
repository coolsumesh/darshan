import pg from "pg";

const { Pool } = pg;

export type Db = pg.Pool;

let pool: pg.Pool | null = null;

export function getDb(): pg.Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  pool = new Pool({
    connectionString
  });

  return pool;
}
