import type { FastifyInstance } from "fastify";
import { addConnection } from "../broadcast.js";

export async function registerWs(server: FastifyInstance) {
  server.get(
    "/ws",
    { websocket: true },
    (socket) => {
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
