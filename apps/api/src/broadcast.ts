import type { WsEvent } from "@darshan/shared";

// Using the ws WebSocket shape; @fastify/websocket wraps ws sockets
type WS = { readyState: number; OPEN: number; send(data: string): void; on(event: string, cb: () => void): void };

const connections = new Set<WS>();

export function addConnection(ws: WS) {
  connections.add(ws);
  ws.on("close", () => connections.delete(ws));
}

export function broadcast<T>(type: string, data: T) {
  const event: WsEvent<T> = { type, ts: new Date().toISOString(), data };
  const payload = JSON.stringify(event);
  for (const ws of connections) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}
