import type { FastifyInstance } from "fastify";
import { addConnection } from "../broadcast.js";

// socket is a ws.WebSocket instance provided by @fastify/websocket
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySocket = any;

export async function registerWs(server: FastifyInstance) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).get(
    "/ws",
    { websocket: true },
    (socket: AnySocket) => {
      addConnection(socket);
      socket.send(
        JSON.stringify({
          type: "connected",
          ts: new Date().toISOString(),
          data: { message: "connected to darshan event stream" },
        })
      );
    }
  );
}
