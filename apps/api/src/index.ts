import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { APP_NAME, type HealthResponse } from "@darshan/shared";
import { getDb } from "./db.js";
import { runMigrations } from "./migrations.js";
import { registerOpsRateLimits } from "./routes/opsRateLimits.js";
import { registerAgents } from "./routes/agents.js";
import { registerThreads } from "./routes/threads.js";
import { registerMessages } from "./routes/messages.js";
import { registerRuns } from "./routes/runs.js";
import { registerA2A } from "./routes/a2a.js";
import { registerAuditRoute } from "./routes/auditRoute.js";
import { registerWs } from "./routes/ws.js";
import { startConnector } from "./connector.js";
import { registerProjects } from "./routes/projects.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = Fastify({ logger: true });

// Ensure uploads directory exists
const uploadsDir = join(__dirname, "..", "uploads", "logos");
mkdirSync(uploadsDir, { recursive: true });

await server.register(cors, { origin: true });
await server.register(websocket);
await server.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB
await server.register(fastifyStatic, {
  root: join(__dirname, "..", "uploads"),
  prefix: "/uploads/",
  decorateReply: false,
});

server.get("/health", async (): Promise<HealthResponse> => {
  return { ok: true, service: `${APP_NAME}-api`, time: new Date().toISOString() };
});

server.get("/", async () => {
  return { ok: true, service: `${APP_NAME}-api` };
});

const db = getDb();
await runMigrations(db);

await registerAgents(server, db);
await registerThreads(server, db);
await registerMessages(server, db);
await registerRuns(server, db);
await registerA2A(server, db);
await registerAuditRoute(server, db);
await registerOpsRateLimits(server, db);
await registerProjects(server, db);
await registerWs(server);

startConnector(db);

await server.listen({ port: PORT, host: HOST });
