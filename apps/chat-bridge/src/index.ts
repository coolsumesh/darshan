import "dotenv/config";
import Fastify from "fastify";

const PORT = Number(process.env.PORT ?? 4400);
const HOST = process.env.HOST ?? "0.0.0.0";

const BRIDGE_TOKEN = process.env.OPENCLAW_CHAT_BRIDGE_TOKEN?.trim();
const OPENCLAW_BASE_URL = (process.env.OPENCLAW_BASE_URL ?? "http://127.0.0.1:18789").replace(/\/$/, "");
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY?.trim();
const OPENCLAW_MODEL = process.env.OPENCLAW_MODEL?.trim() || "openclaw";
const OPENCLAW_AGENT_ID_MAP_JSON = process.env.OPENCLAW_AGENT_ID_MAP_JSON?.trim();

const server = Fastify({ logger: true });

type BridgeRequest = {
  agent_id: string;
  agent_name?: string;
  thread_id: string;
  run_id: string;
  message: string;
  channel?: string;
  chat_id?: string;
  sender_id?: string;
  sender_name?: string;
  project_id?: string;
};

type ChatCompletionsOut = {
  choices?: Array<{ message?: { content?: string } }>;
};

function unauthorized(reply: import("fastify").FastifyReply, error = "unauthorized") {
  return reply.status(401).send({ ok: false, error });
}

function extractOutputText(data: ChatCompletionsOut): string | null {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  return null;
}

function parseAgentMap(): Record<string, string> {
  if (!OPENCLAW_AGENT_ID_MAP_JSON) return {};
  try {
    const parsed = JSON.parse(OPENCLAW_AGENT_ID_MAP_JSON) as Record<string, string>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

const AGENT_ID_MAP = parseAgentMap();

function resolveOpenClawAgentId(requestedAgentId: string): string {
  return AGENT_ID_MAP[requestedAgentId] ?? "main";
}

async function callOpenClaw(params: {
  message: string;
  agentName: string;
  requestedAgentId: string;
  channel: string;
  chatId: string;
  senderId?: string;
  senderName?: string;
  projectId?: string;
}): Promise<string | null> {
  const openclawAgentId = resolveOpenClawAgentId(params.requestedAgentId);

  const res = await fetch(`${OPENCLAW_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENCLAW_API_KEY ? { Authorization: `Bearer ${OPENCLAW_API_KEY}` } : {}),
      "x-openclaw-agent-id": openclawAgentId,
      "x-openclaw-channel": params.channel,
      "x-openclaw-chat-id": params.chatId,
      ...(params.senderId ? { "x-openclaw-sender-id": params.senderId } : {}),
      ...(params.senderName ? { "x-openclaw-sender-name": params.senderName } : {}),
      ...(params.projectId ? { "x-openclaw-project-id": params.projectId } : {}),
    },
    body: JSON.stringify({
      model: OPENCLAW_MODEL,
      messages: [
        {
          role: "system",
          content: `You are ${params.agentName}. You are replying inside Darshan channel chat. Be concise and actionable.`,
        },
        {
          role: "user",
          content: params.message,
        },
      ],
      metadata: {
        channel: params.channel,
        chat_id: params.chatId,
        sender_id: params.senderId,
        sender_name: params.senderName,
        project_id: params.projectId,
        darshan_agent_id: params.requestedAgentId,
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`openclaw chat api failed: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as ChatCompletionsOut;
  return extractOutputText(data);
}

server.get("/health", async () => ({
  ok: true,
  service: "darshan-chat-bridge",
  upstream_base_url: OPENCLAW_BASE_URL,
  channel: "darshan",
  time: new Date().toISOString(),
}));

server.post<{ Body: BridgeRequest }>("/darshan/chat", async (req, reply) => {
  if (BRIDGE_TOKEN) {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) return unauthorized(reply);
    const token = auth.slice(7);
    if (token !== BRIDGE_TOKEN) return unauthorized(reply);
  }

  const body = req.body;
  if (!body?.agent_id || !body?.thread_id || !body?.run_id || !body?.message?.trim()) {
    return reply.status(400).send({ ok: false, error: "invalid payload" });
  }

  const agentName = (body.agent_name ?? "Agent").trim() || "Agent";
  const channel = (body.channel ?? "darshan").trim() || "darshan";
  const chatId = (body.chat_id ?? body.thread_id).trim();

  try {
    const replyText = await callOpenClaw({
      message: body.message,
      agentName,
      requestedAgentId: body.agent_id,
      channel,
      chatId,
      senderId: body.sender_id,
      senderName: body.sender_name,
      projectId: body.project_id,
    });
    if (!replyText) {
      return reply.status(502).send({ ok: false, error: "empty response from openclaw" });
    }
    return { ok: true, reply: replyText };
  } catch (error) {
    req.log.error({ err: error }, "bridge call failed");
    return reply.status(502).send({ ok: false, error: "bridge upstream failure" });
  }
});

server.listen({ port: PORT, host: HOST }).catch((err) => {
  server.log.error(err);
  process.exit(1);
});
