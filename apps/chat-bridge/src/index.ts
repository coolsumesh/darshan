import "dotenv/config";
import Fastify from "fastify";

const PORT = Number(process.env.PORT ?? 4400);
const HOST = process.env.HOST ?? "0.0.0.0";

const BRIDGE_TOKEN = process.env.OPENCLAW_CHAT_BRIDGE_TOKEN?.trim();
const OPENCLAW_BASE_URL = (process.env.OPENCLAW_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY?.trim();
const OPENCLAW_MODEL = process.env.OPENCLAW_MODEL?.trim() || "openclaw";

const server = Fastify({ logger: true });

type BridgeRequest = {
  agent_id: string;
  agent_name?: string;
  thread_id: string;
  run_id: string;
  message: string;
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

async function callOpenClaw(message: string, agentName: string): Promise<string | null> {
  const res = await fetch(`${OPENCLAW_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENCLAW_API_KEY ? { Authorization: `Bearer ${OPENCLAW_API_KEY}` } : {}),
      "x-openclaw-agent-id": "main",
    },
    body: JSON.stringify({
      model: OPENCLAW_MODEL,
      messages: [
        {
          role: "system",
          content: `You are ${agentName}. Respond conversationally and concisely for Darshan chat.`,
        },
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`openclaw chat api failed: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as ChatCompletionsOut;
  return extractOutputText(data);
}

server.get("/health", async () => ({ ok: true, service: "darshan-chat-bridge", time: new Date().toISOString() }));

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

  try {
    const replyText = await callOpenClaw(body.message, agentName);
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
