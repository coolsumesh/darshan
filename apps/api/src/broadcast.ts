import type { WsEvent } from "@darshan/shared";

// Using the ws WebSocket shape; @fastify/websocket wraps ws sockets
type WS = { readyState: number; OPEN: number; send(data: string): void; on(event: string, cb: () => void): void };

// ── Global broadcast (UI clients) ────────────────────────────────────────────
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

// ── Agent-specific channels (a2a real-time push) ──────────────────────────────
const agentConnections = new Map<string, Set<WS>>();

export function subscribeAgent(agentId: string, ws: WS) {
  if (!agentConnections.has(agentId)) agentConnections.set(agentId, new Set());
  agentConnections.get(agentId)!.add(ws);
  ws.on("close", () => {
    agentConnections.get(agentId)?.delete(ws);
    if (agentConnections.get(agentId)?.size === 0) agentConnections.delete(agentId);
  });
}

/** Push an event directly to a specific agent's connected WS clients. */
export function pushToAgent<T>(agentId: string, type: string, data: T) {
  const sockets = agentConnections.get(agentId);
  if (!sockets?.size) return 0;
  const event: WsEvent<T> = { type, ts: new Date().toISOString(), data };
  const payload = JSON.stringify(event);
  let sent = 0;
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
      sent++;
    }
  }
  return sent;
}
