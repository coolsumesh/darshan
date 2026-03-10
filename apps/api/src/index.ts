import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
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
import { registerNotifications } from "./routes/notifications.js";
import { registerRuns } from "./routes/runs.js";
import { registerAgentChat } from "./routes/agentChat.js";
import { registerAgentLevels } from "./routes/agent_levels.js";
import { registerAuditRoute } from "./routes/auditRoute.js";
import { registerWs } from "./routes/ws.js";
import { startConnector } from "./connector.js";
import { registerProjects } from "./routes/projects.js";
import { registerProjectChat } from "./routes/projectChat.js";
import { registerInvites } from "./routes/invites.js";
import { registerWorkspaces } from "./routes/workspaces.js";
import { registerAuth, verifyToken } from "./routes/auth.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = Fastify({ logger: true });

// Ensure uploads directory exists
const uploadsDir = join(__dirname, "..", "uploads", "logos");
mkdirSync(uploadsDir, { recursive: true });

await server.register(cors, { origin: true, credentials: true });
await server.register(cookie);
await server.register(websocket);
await server.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 } });
await server.register(fastifyStatic, {
  root: join(__dirname, "..", "uploads"),
  prefix: "/uploads/",
  decorateReply: false,
});

// ── Root / health (no prefix) ─────────────────────────────────────────────────
server.get("/health", async (): Promise<HealthResponse> => {
  return { ok: true, service: `${APP_NAME}-api`, time: new Date().toISOString() };
});
server.get("/", async () => {
  return { ok: true, service: `${APP_NAME}-api` };
});

// ── WebSocket (no prefix — lives at /ws) ─────────────────────────────────────
const db = getDb();
await runMigrations(db);
await registerWs(server, db);

// ── Auth guard for all /api/v1/* ───────────────────────────────────────────────
// Routes that handle their own auth return early here.
const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "824cdfcdec0e35cf550002c2dfa3541932f58e2e2497cfaa3c844dc99f5b972f";

server.addHook("preHandler", async (req, reply) => {
  const url = req.url.split("?")[0];
  if (!url.startsWith("/api/v1/")) return;

  // Auth routes — no guard
  if (url.startsWith("/api/v1/auth/")) return;

  // Agent callback-token routes — handle auth internally
  if (url.includes("/inbox"))                                       return;
  if (/^\/api\/v1\/agents\/[^/]+\/tasks$/.test(url))               return;
  if (req.method === "PATCH" && /^\/api\/v1\/projects\/[^/]+\/tasks\/[^/]+$/.test(url)) return;

  // Threads + notifications — dual-auth handled in route
  if (url.startsWith("/api/v1/threads"))                           return;
  if (url.startsWith("/api/v1/notifications"))                     return;

  // Project agents — callback-token auth in route
  if (/^\/api\/v1\/projects\/[^/]+\/agents$/.test(url))            return;

  // Public invite preview
  if (url.startsWith("/api/v1/invites/"))                          return;

  // 1. Internal API key
  const authHeader = req.headers.authorization ?? "";
  if (authHeader.startsWith("Bearer ")) {
    if (authHeader.slice(7) === INTERNAL_API_KEY) return;
  }

  // 2. JWT cookie
  const token = (req.cookies as Record<string, string>)?.["darshan_token"];
  if (!token) return reply.status(401).send({ ok: false, error: "not authenticated" });
  const payload = verifyToken(token);
  if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
});

// ── All API routes registered under /api/v1 prefix ───────────────────────────
await server.register(async (app) => {
  await registerAuth(app);
  await registerAgents(app, db);
  await registerThreads(app, db);
  await registerNotifications(app, db);
  await registerRuns(app, db);
  await registerAgentChat(app, db);
  await registerAgentLevels(app, db);
  await registerAuditRoute(app, db);
  await registerOpsRateLimits(app, db);
  await registerProjects(app, db);
  await registerProjectChat(app, db);
  await registerInvites(app, db);
  await registerWorkspaces(app, db);
}, { prefix: "/api/v1" });

startConnector(db);

await server.listen({ port: PORT, host: HOST });
