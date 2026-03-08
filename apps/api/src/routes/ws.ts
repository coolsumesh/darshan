import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { addConnection, subscribeAgent } from "../broadcast.js";

// socket is a ws.WebSocket instance provided by @fastify/websocket
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySocket = any;

export async function registerWs(server: FastifyInstance, db?: pg.Pool) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).get(
    "/ws",
    { websocket: true },
    (socket: AnySocket) => {
      // Add to global broadcast pool (UI dashboards)
      addConnection(socket);

      socket.send(
        JSON.stringify({
          type: "connected",
          ts: new Date().toISOString(),
          data: { message: "connected to darshan event stream" },
        })
      );

      // Listen for agent auth message to subscribe to agent-specific channel
      // Expected: { type: "agent_auth", agent_id: "...", token: "..." }
      socket.on("message", async (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
          if (msg?.type !== "agent_auth" || !msg.agent_id || !msg.token) return;

          // Validate callback token
          if (!db) {
            socket.send(JSON.stringify({ type: "agent_auth_error", data: { error: "db unavailable" } }));
            return;
          }

          const { rows } = await db.query(
            `select id from agents where id = $1 and callback_token = $2 limit 1`,
            [msg.agent_id, msg.token]
          );

          if (!rows.length) {
            socket.send(JSON.stringify({ type: "agent_auth_error", data: { error: "invalid agent_id or token" } }));
            return;
          }

          // Subscribe this socket to the agent's channel
          subscribeAgent(msg.agent_id, socket);

          socket.send(JSON.stringify({
            type: "agent_subscribed",
            ts: new Date().toISOString(),
            data: { agent_id: msg.agent_id, message: "subscribed to agent inbox push" },
          }));

        } catch { /* ignore malformed messages */ }
      });
    }
  );
}
