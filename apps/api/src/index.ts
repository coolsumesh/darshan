import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { APP_NAME, type HealthResponse } from "@darshan/shared";
import { getDb } from "./db.js";
import { runMigrations } from "./migrations.js";
import { registerOpsRateLimits } from "./routes/opsRateLimits.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: true
});

server.get("/health", async (): Promise<HealthResponse> => {
  return {
    ok: true,
    service: `${APP_NAME}-api`,
    time: new Date().toISOString()
  };
});

server.get("/", async () => {
  return { ok: true, service: `${APP_NAME}-api` };
});

const db = getDb();
await runMigrations(db);
await registerOpsRateLimits(server, db);

await server.listen({ port: PORT, host: HOST });
