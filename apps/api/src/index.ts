import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
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

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });
await server.register(websocket);

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
await registerWs(server);

startConnector(db);

await server.listen({ port: PORT, host: HOST });
