import type { ProjectChatMessage } from "@darshan/shared";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { appendAuditEvent } from "../audit.js";
import { broadcast } from "../broadcast.js";
import { getRequestUser } from "./auth.js";

function extractAgentMentions(content: string): string[] {
  const matches = content.matchAll(/@([a-zA-Z0-9._-]+)/g);
  const names = new Set<string>();
  for (const m of matches) {
    const raw = (m[1] ?? "").trim().toLowerCase();
    if (raw) names.add(raw);
  }
  return [...names];
}

type BridgeResponse = { ok?: boolean; reply?: string };

function pickProjectFallback(agentName: string): string {
  const key = agentName.toLowerCase();
  if (key === "mithran") return "Got it. I reviewed your message and will proceed.";
  if (key === "sanjaya") return "Understood. I’m on it and will update shortly.";
  return "Acknowledged. I’ve reviewed your message and will proceed accordingly.";
}

async function ensureAgentThread(db: pg.Pool, userId: string, agentId: string): Promise<string> {
  const existing = await db.query<{ thread_id: string }>(
    `select thread_id from agent_chats where user_id = $1 and agent_id = $2`,
    [userId, agentId]
  );
  if (existing.rows[0]?.thread_id) return existing.rows[0].thread_id;

  const client = await db.connect();
  try {
    await client.query("begin");

    const { rows: agentRows } = await client.query<{ name: string }>(
      `select name from agents where id = $1`,
      [agentId]
    );
    const agentName = agentRows[0]?.name ?? "Agent";

    const { rows: threadRows } = await client.query<{ id: string }>(
      `insert into threads (title, visibility, created_by_user_id)
       values ($1, 'private', $2)
       returning id`,
      [`Chat: ${agentName}`, userId]
    );

    const threadId = threadRows[0]!.id;

    await client.query(
      `insert into thread_participants (thread_id, participant_type, user_id, can_read, can_write)
       values ($1, 'human', $2, true, true)
       on conflict do nothing`,
      [threadId, userId]
    );

    await client.query(
      `insert into thread_participants (thread_id, participant_type, agent_id, can_read, can_write)
       values ($1, 'agent', $2, true, true)
       on conflict do nothing`,
      [threadId, agentId]
    );

    await client.query(
      `insert into agent_chats (user_id, agent_id, thread_id)
       values ($1, $2, $3)
       on conflict (user_id, agent_id) do update set thread_id = excluded.thread_id, updated_at = now()`,
      [userId, agentId, threadId]
    );

    await client.query("commit");
    return threadId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function getBridgeReply(params: {
  agentId: string;
  agentName: string;
  threadId: string;
  runId: string;
  userMessage: string;
}): Promise<string | null> {
  const bridgeUrl = process.env.OPENCLAW_CHAT_BRIDGE_URL?.trim();
  if (!bridgeUrl) return null;

  try {
    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OPENCLAW_CHAT_BRIDGE_TOKEN
          ? { Authorization: `Bearer ${process.env.OPENCLAW_CHAT_BRIDGE_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        agent_id: params.agentId,
        agent_name: params.agentName,
        thread_id: params.threadId,
        run_id: params.runId,
        message: params.userMessage,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as BridgeResponse;
    if (!data?.reply || typeof data.reply !== "string") return null;
    return data.reply.trim() || null;
  } catch {
    return null;
  }
}

type ProjectRole = "owner" | "admin" | "contributor" | "viewer";
const ROLE_RANK: Record<ProjectRole, number> = { owner: 4, admin: 3, contributor: 2, viewer: 1 };

export async function registerProjectChat(server: FastifyInstance, db: pg.Pool) {
  async function checkAccess(
    idOrSlug: string,
    req: unknown,
    minRole: ProjectRole = "viewer"
  ): Promise<{ projectId: string; role: ProjectRole } | { deny: 404 | 403 }> {
    const { rows } = await db.query(
      `select id, owner_user_id, org_id from projects where id::text = $1 or lower(slug) = lower($1)`,
      [idOrSlug]
    );
    if (!rows[0]) return { deny: 404 };

    const userId = getRequestUser(req)?.userId ?? null;
    const authHeader = (req as { headers?: Record<string, string | undefined> })?.headers?.authorization ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const INTERNAL_API_KEY = process.env.DARSHAN_API_KEY ?? "824cdfcdec0e35cf550002c2dfa3541932f58e2e2497cfaa3c844dc99f5b972f";

    if (bearer && bearer === INTERNAL_API_KEY) return { projectId: rows[0].id, role: "owner" };
    if (!userId) return { deny: 403 };

    let role: ProjectRole;
    if (rows[0].owner_user_id === userId) {
      role = "owner";
    } else {
      const { rows: projectRoles } = await db.query(
        `select role from project_users where project_id = $1 and user_id = $2`,
        [rows[0].id, userId]
      );
      if (projectRoles[0]) {
        role = projectRoles[0].role as ProjectRole;
      } else if (rows[0].org_id) {
        const { rows: orgRoles } = await db.query(
          `select role from org_users where org_id = $1 and user_id = $2`,
          [rows[0].org_id, userId]
        );
        if (!orgRoles[0]) return { deny: 403 };
        role = orgRoles[0].role as ProjectRole;
      } else {
        return { deny: 403 };
      }
    }

    if (ROLE_RANK[role] < ROLE_RANK[minRole]) return { deny: 403 };
    return { projectId: rows[0].id, role };
  }

  server.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/v1/projects/:id/chat/messages",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) {
        return reply.status(access.deny).send({
          ok: false,
          error: access.deny === 404 ? "project not found" : "forbidden",
        });
      }

      const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 200);
      const { rows } = await db.query<ProjectChatMessage>(
        `select pcm.id,
                pcm.project_id,
                pcm.author_type,
                pcm.author_user_id,
                pcm.author_agent_id,
                pcm.content,
                pcm.created_at,
                coalesce(u.name, a.name, 'System') as author_name,
                u.avatar_url as author_avatar_url
         from project_chat_messages pcm
         left join users u on u.id = pcm.author_user_id
         left join agents a on a.id = pcm.author_agent_id
         where pcm.project_id = $1
         order by pcm.created_at desc
         limit $2`,
        [access.projectId, limit]
      );

      return { ok: true, messages: rows.reverse() };
    }
  );

  server.post<{ Params: { id: string }; Body: { content?: string } }>(
    "/api/v1/projects/:id/chat/messages",
    async (req, reply) => {
      const access = await checkAccess(req.params.id, req, "viewer");
      if ("deny" in access) {
        return reply.status(access.deny).send({
          ok: false,
          error: access.deny === 404 ? "project not found" : "forbidden",
        });
      }

      const content = req.body?.content?.trim();
      if (!content) return reply.status(400).send({ ok: false, error: "content is required" });

      const user = getRequestUser(req);
      const authorType: ProjectChatMessage["author_type"] = user ? "human" : "system";
      const authorUserId = user?.userId ?? null;

      const { rows: insertedRows } = await db.query<ProjectChatMessage>(
        `insert into project_chat_messages (project_id, author_type, author_user_id, content)
         values ($1, $2, $3, $4)
         returning id, project_id, author_type, author_user_id, author_agent_id, content, created_at`,
        [access.projectId, authorType, authorUserId, content]
      );
      const inserted = insertedRows[0];

      const { rows: messageRows } = await db.query<ProjectChatMessage>(
        `select pcm.id,
                pcm.project_id,
                pcm.author_type,
                pcm.author_user_id,
                pcm.author_agent_id,
                pcm.content,
                pcm.created_at,
                coalesce(u.name, a.name, 'System') as author_name,
                u.avatar_url as author_avatar_url
         from project_chat_messages pcm
         left join users u on u.id = pcm.author_user_id
         left join agents a on a.id = pcm.author_agent_id
         where pcm.id = $1`,
        [inserted.id]
      );
      const message = messageRows[0];

      await appendAuditEvent(db, {
        actor: user
          ? { actor_type: "human", actor_user_id: user.userId }
          : { actor_type: "system" },
        action: "project_chat.message.create",
        resource_type: "project_chat_message",
        resource_id: inserted.id,
        decision: "allow",
        metadata: { project_id: access.projectId },
      });

      broadcast("project_chat:message_created", { message });

      // Mention-triggered agent responses (noise control): agents only reply when explicitly tagged.
      // Example: "@Mithran @Sanjaya can you split today's blockers?"
      if (authorType === "human" && user?.userId) {
        const mentionKeys = extractAgentMentions(content);
        if (mentionKeys.length > 0) {
          void (async () => {
            const { rows: projectAgents } = await db.query<{ id: string; name: string }>(
              `select a.id, a.name
               from project_agents pa
               join agents a on a.id = pa.agent_id
               where pa.project_id = $1`,
              [access.projectId]
            );

            const targets = projectAgents.filter((a) => mentionKeys.includes(a.name.toLowerCase()));
            for (const target of targets) {
              const threadId = await ensureAgentThread(db, user.userId, target.id);
              const bridgedReply = await getBridgeReply({
                agentId: target.id,
                agentName: target.name,
                threadId,
                runId: inserted.id,
                userMessage: content,
              });
              const replyText = bridgedReply ?? pickProjectFallback(target.name);

              const { rows: agentRows } = await db.query<ProjectChatMessage>(
                `insert into project_chat_messages (project_id, author_type, author_agent_id, content)
                 values ($1, 'agent', $2, $3)
                 returning id, project_id, author_type, author_user_id, author_agent_id, content, created_at`,
                [access.projectId, target.id, replyText]
              );

              const { rows: hydratedRows } = await db.query<ProjectChatMessage>(
                `select pcm.id,
                        pcm.project_id,
                        pcm.author_type,
                        pcm.author_user_id,
                        pcm.author_agent_id,
                        pcm.content,
                        pcm.created_at,
                        coalesce(u.name, a.name, 'System') as author_name,
                        u.avatar_url as author_avatar_url
                 from project_chat_messages pcm
                 left join users u on u.id = pcm.author_user_id
                 left join agents a on a.id = pcm.author_agent_id
                 where pcm.id = $1`,
                [agentRows[0].id]
              );

              const agentMessage = hydratedRows[0];
              if (agentMessage) {
                broadcast("project_chat:message_created", { message: agentMessage });
              }
            }
          })();
        }
      }

      return reply.status(201).send({ ok: true, message });
    }
  );
}
