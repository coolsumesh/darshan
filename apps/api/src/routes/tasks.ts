import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { appendAuditEvent } from "../audit.js";
import { broadcast } from "../broadcast.js";

function getUserId(req: { headers: Record<string, string | string[] | undefined> }): string {
  const h = req.headers["x-user-id"];
  return (Array.isArray(h) ? h[0] : h) ?? "sumesh";
}

export async function registerTasks(server: FastifyInstance, db: pg.Pool) {

  // GET /api/v1/tasks — list tasks (filterable by status)
  server.get<{ Querystring: { status?: string } }>(
    "/api/v1/tasks",
    async (req) => {
      const { status } = req.query;
      const { rows } = await db.query(
        `select t.*,
                a_prop.name as proposed_by_agent_name,
                a_claim.name as claimed_by_agent_name
         from tasks t
         left join agents a_prop  on a_prop.id  = t.proposed_by_agent_id
         left join agents a_claim on a_claim.id = t.claimed_by_agent_id
         ${status ? "where t.status = $1" : ""}
         order by t.seq desc`,
        status ? [status] : []
      );
      return { ok: true, tasks: rows };
    }
  );

  // POST /api/v1/tasks — propose a new task (agent or human)
  server.post<{
    Body: {
      title: string;
      description?: string;
      proposedByAgentId?: string; // if agent is proposing
    };
  }>("/api/v1/tasks", async (req, reply) => {
    const userId = getUserId(req);
    const { title, description = "", proposedByAgentId } = req.body ?? {};

    if (!title?.trim()) {
      return reply.status(400).send({ ok: false, error: "title is required" });
    }

    // If proposedByAgentId provided → agent-proposed (needs approval)
    // Otherwise → human-proposed (auto-approved)
    const isAgentProposal = !!proposedByAgentId;
    const initialStatus = isAgentProposal ? "proposed" : "approved";

    let proposedByType: string;
    let proposedByUserId: string | null = null;
    let proposedByAgentIdVal: string | null = null;

    if (isAgentProposal) {
      // Verify agent exists
      const { rows: agentRows } = await db.query(
        `select id from agents where id = $1`,
        [proposedByAgentId]
      );
      if (agentRows.length === 0) {
        return reply.status(404).send({ ok: false, error: "agent not found" });
      }
      proposedByType = "agent";
      proposedByAgentIdVal = proposedByAgentId!;
    } else {
      proposedByType = "human";
      proposedByUserId = userId;
    }

    const { rows } = await db.query(
      `insert into tasks
         (title, description, status, proposed_by_type, proposed_by_user_id, proposed_by_agent_id,
          approved_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        title.trim(),
        description.trim(),
        initialStatus,
        proposedByType,
        proposedByUserId,
        proposedByAgentIdVal,
        isAgentProposal ? null : new Date(), // human tasks auto-approved
      ]
    );
    const task = rows[0];

    await appendAuditEvent(db, {
      actor: isAgentProposal
        ? { actor_type: "agent", actor_agent_id: proposedByAgentId }
        : { actor_type: "human", actor_user_id: userId },
      action: "task.propose",
      resource_type: "task",
      resource_id: task.id,
      decision: "allow",
    });

    broadcast("task.created", { task });

    return reply.status(201).send({ ok: true, task });
  });

  // PATCH /api/v1/tasks/:id/approve — Mithran approves a proposed task
  server.patch<{ Params: { id: string } }>(
    "/api/v1/tasks/:id/approve",
    async (req, reply) => {
      const userId = getUserId(req);
      const { rows } = await db.query(
        `update tasks
         set status = 'approved', approved_at = now(), updated_at = now()
         where id = $1 and status = 'proposed'
         returning *`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return reply.status(404).send({ ok: false, error: "task not found or not in proposed state" });
      }
      const task = rows[0];

      await appendAuditEvent(db, {
        actor: { actor_type: "human", actor_user_id: userId },
        action: "task.approve",
        resource_type: "task",
        resource_id: task.id,
        decision: "allow",
      });

      broadcast("task.updated", { task });
      return { ok: true, task };
    }
  );

  // PATCH /api/v1/tasks/:id/reject — Mithran rejects a proposed task
  server.patch<{
    Params: { id: string };
    Body: { reason?: string };
  }>("/api/v1/tasks/:id/reject", async (req, reply) => {
    const userId = getUserId(req);
    const { reason = "" } = req.body ?? {};

    const { rows } = await db.query(
      `update tasks
       set status = 'rejected', rejected_at = now(), rejection_reason = $2, updated_at = now()
       where id = $1 and status = 'proposed'
       returning *`,
      [req.params.id, reason]
    );
    if (rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "task not found or not in proposed state" });
    }
    const task = rows[0];

    await appendAuditEvent(db, {
      actor: { actor_type: "human", actor_user_id: userId },
      action: "task.reject",
      resource_type: "task",
      resource_id: task.id,
      decision: "allow",
    });

    broadcast("task.updated", { task });
    return { ok: true, task };
  });

  // PATCH /api/v1/tasks/:id/claim — agent claims an approved task
  server.patch<{
    Params: { id: string };
    Body: { agentId: string };
  }>("/api/v1/tasks/:id/claim", async (req, reply) => {
    const { agentId } = req.body ?? {};
    if (!agentId) {
      return reply.status(400).send({ ok: false, error: "agentId is required" });
    }

    const { rows } = await db.query(
      `update tasks
       set status = 'in_progress', claimed_by_agent_id = $2, updated_at = now()
       where id = $1 and status = 'approved'
       returning *`,
      [req.params.id, agentId]
    );
    if (rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "task not found or not available to claim" });
    }
    const task = rows[0];

    await appendAuditEvent(db, {
      actor: { actor_type: "agent", actor_agent_id: agentId },
      action: "task.claim",
      resource_type: "task",
      resource_id: task.id,
      decision: "allow",
    });

    broadcast("task.updated", { task });
    return { ok: true, task };
  });

  // PATCH /api/v1/tasks/:id/done — agent marks task complete
  server.patch<{
    Params: { id: string };
    Body: { agentId: string };
  }>("/api/v1/tasks/:id/done", async (req, reply) => {
    const { agentId } = req.body ?? {};
    if (!agentId) {
      return reply.status(400).send({ ok: false, error: "agentId is required" });
    }

    const { rows } = await db.query(
      `update tasks
       set status = 'done', completed_at = now(), updated_at = now()
       where id = $1 and status = 'in_progress' and claimed_by_agent_id = $2
       returning *`,
      [req.params.id, agentId]
    );
    if (rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "task not found, not in progress, or not owned by this agent" });
    }
    const task = rows[0];

    await appendAuditEvent(db, {
      actor: { actor_type: "agent", actor_agent_id: agentId },
      action: "task.done",
      resource_type: "task",
      resource_id: task.id,
      decision: "allow",
    });

    broadcast("task.updated", { task });
    return { ok: true, task };
  });
}
