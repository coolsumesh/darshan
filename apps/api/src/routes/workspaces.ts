import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";

export async function registerWorkspaces(server: FastifyInstance, db: pg.Pool) {

  // ── POST /api/v1/workspaces — create ──────────────────────────────────────
  server.post<{ Body: { name: string; description?: string } }>(
    "/api/v1/workspaces",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { name, description } = req.body ?? {};
      if (!name?.trim()) return reply.status(400).send({ ok: false, error: "name is required" });

      const { rows: [ws] } = await db.query(
        `INSERT INTO workspaces (name, description, owner_user_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [name.trim(), description?.trim() ?? null, user.userId]
      );

      return { ok: true, workspace: ws };
    }
  );

  // ── GET /api/v1/workspaces — list mine ────────────────────────────────────
  server.get(
    "/api/v1/workspaces",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { rows } = await db.query(
        `SELECT w.*,
                COUNT(p.id)::int AS project_count
         FROM workspaces w
         LEFT JOIN projects p ON p.workspace_id = w.id
         WHERE w.owner_user_id = $1
         GROUP BY w.id
         ORDER BY w.created_at DESC`,
        [user.userId]
      );

      return { ok: true, workspaces: rows };
    }
  );

  // ── GET /api/v1/workspaces/:id — get one ──────────────────────────────────
  server.get<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { rows: [ws] } = await db.query(
        `SELECT w.*, COUNT(p.id)::int AS project_count
         FROM workspaces w
         LEFT JOIN projects p ON p.workspace_id = w.id
         WHERE w.id = $1 AND w.owner_user_id = $2
         GROUP BY w.id`,
        [req.params.id, user.userId]
      );
      if (!ws) return reply.status(404).send({ ok: false, error: "workspace not found" });

      const { rows: projects } = await db.query(
        `SELECT id, name, slug, status, progress, created_at
         FROM projects WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [req.params.id]
      );

      return { ok: true, workspace: ws, projects };
    }
  );

  // ── PATCH /api/v1/workspaces/:id — update ─────────────────────────────────
  server.patch<{ Params: { id: string }; Body: { name?: string; description?: string } }>(
    "/api/v1/workspaces/:id",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { name, description } = req.body ?? {};
      if (!name?.trim() && description === undefined) {
        return reply.status(400).send({ ok: false, error: "nothing to update" });
      }

      const updates: string[] = ["updated_at = now()"];
      const params: unknown[] = [];

      if (name?.trim()) {
        params.push(name.trim());
        updates.push(`name = $${params.length}`);
      }
      if (description !== undefined) {
        params.push(description?.trim() ?? null);
        updates.push(`description = $${params.length}`);
      }

      params.push(req.params.id, user.userId);
      const { rows: [ws] } = await db.query(
        `UPDATE workspaces SET ${updates.join(", ")}
         WHERE id = $${params.length - 1} AND owner_user_id = $${params.length}
         RETURNING *`,
        params
      );

      if (!ws) return reply.status(404).send({ ok: false, error: "workspace not found" });
      return { ok: true, workspace: ws };
    }
  );

  // ── DELETE /api/v1/workspaces/:id — delete ────────────────────────────────
  // Projects become standalone (workspace_id set to NULL via ON DELETE SET NULL)
  server.delete<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { rowCount } = await db.query(
        `DELETE FROM workspaces WHERE id = $1 AND owner_user_id = $2`,
        [req.params.id, user.userId]
      );

      if (!rowCount) return reply.status(404).send({ ok: false, error: "workspace not found" });
      return { ok: true };
    }
  );
}
