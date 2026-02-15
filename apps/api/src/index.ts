import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { APP_NAME, type HealthResponse } from "@darshan/shared";

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

await server.listen({ port: PORT, host: HOST });
