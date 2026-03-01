import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { getRequestUser } from "./auth.js";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://darshan.caringgems.in";

export async function registerInvites(server: FastifyInstance, db: pg.Pool) {

  // ── GET /api/v1/me/invites ─────────────────────────────────────────────────
  // Returns all pending invites (project + org) addressed to the current user's email.
  server.get("/api/v1/me/invites", async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

    // Project invites
    const { rows: projectRows } = await db.query(
      `select pi.id, pi.token, pi.role, pi.invitee_email, pi.expires_at, pi.created_at,
              'project'   as invite_type,
              p.id        as project_id,
              p.name      as project_name,
              p.slug      as project_slug,
              null::text  as org_id,
              null::text  as org_name,
              null::text  as org_slug,
              u.name      as invited_by_name
       from   project_invites pi
       join   projects p on p.id = pi.project_id
       left join users u on u.id = pi.invited_by
       where  lower(pi.invitee_email) = lower($1)
         and  pi.accepted_at is null
         and  pi.declined_at is null
         and  pi.expires_at  > now()`,
      [user.email]
    );

    // Org user invites
    const { rows: orgRows } = await db.query(
      `select oui.id, oui.token, oui.role, oui.invitee_email, oui.expires_at, oui.created_at,
              'org'          as invite_type,
              null::text     as project_id,
              null::text     as project_name,
              null::text     as project_slug,
              o.id::text     as org_id,
              o.name         as org_name,
              o.slug         as org_slug,
              u.name         as invited_by_name
       from   org_user_invites oui
       join   organisations o on o.id = oui.org_id
       left join users u on u.id = oui.invited_by
       where  lower(oui.invitee_email) = lower($1)
         and  oui.accepted_at is null
         and  oui.declined_at is null
         and  oui.expires_at  > now()`,
      [user.email]
    );

    const all = [
      ...projectRows.map((r) => ({ ...r, invite_url: `${APP_BASE_URL}/invite/project/${r.token}` })),
      ...orgRows.map((r) => ({ ...r, invite_url: `${APP_BASE_URL}/invite/org/${r.token}` })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { ok: true, invites: all };
  });

  // ── GET /api/v1/invites/project/:token ────────────────────────────────────
  // Preview invite details — public endpoint (no auth required).
  server.get<{ Params: { token: string } }>(
    "/api/v1/invites/project/:token",
    async (req, reply) => {
      const { rows } = await db.query(
        `select pi.id, pi.token, pi.role, pi.invitee_email, pi.expires_at,
                pi.accepted_at, pi.declined_at,
                p.id   as project_id,
                p.name as project_name,
                p.slug as project_slug,
                u.name as invited_by_name
         from   project_invites pi
         join   projects p on p.id = pi.project_id
         left join users u on u.id = pi.invited_by
         where  pi.token = $1`,
        [req.params.token]
      );

      if (!rows[0]) return reply.status(404).send({ ok: false, error: "invite not found" });

      const inv = rows[0];
      if (inv.expires_at < new Date()) {
        return reply.status(410).send({ ok: false, error: "invite expired" });
      }
      if (inv.accepted_at) return reply.status(409).send({ ok: false, error: "invite already accepted" });
      if (inv.declined_at) return reply.status(409).send({ ok: false, error: "invite already declined" });

      return { ok: true, invite: { ...inv, invite_url: `${APP_BASE_URL}/invite/project/${inv.token}` } };
    }
  );

  // ── POST /api/v1/invites/project/:token/accept ────────────────────────────
  server.post<{ Params: { token: string } }>(
    "/api/v1/invites/project/:token/accept",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { rows } = await db.query(
        `select * from project_invites where token = $1`,
        [req.params.token]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "invite not found" });

      const inv = rows[0];
      if (inv.expires_at < new Date()) return reply.status(410).send({ ok: false, error: "invite expired" });
      if (inv.accepted_at) return reply.status(409).send({ ok: false, error: "already accepted" });
      if (inv.declined_at) return reply.status(409).send({ ok: false, error: "already declined" });

      // Check email restriction
      if (inv.invitee_email && inv.invitee_email.toLowerCase() !== user.email.toLowerCase()) {
        return reply.status(403).send({ ok: false, error: "this invite is for a different email" });
      }

      // Add to project_user_members (upsert — idempotent)
      await db.query(
        `insert into project_user_members (project_id, user_id, role, invited_by)
         values ($1, $2, $3, $4)
         on conflict (project_id, user_id) do update set role = excluded.role`,
        [inv.project_id, user.userId, inv.role, inv.invited_by]
      );

      // Mark invite as accepted
      await db.query(
        `update project_invites set accepted_by = $1, accepted_at = now() where id = $2`,
        [user.userId, inv.id]
      );

      // Return project slug for redirect
      const { rows: proj } = await db.query(
        `select slug, name from projects where id = $1`,
        [inv.project_id]
      );

      return { ok: true, project_slug: proj[0]?.slug ?? inv.project_id, project_name: proj[0]?.name };
    }
  );

  // ── POST /api/v1/invites/project/:token/decline ───────────────────────────
  server.post<{ Params: { token: string } }>(
    "/api/v1/invites/project/:token/decline",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { rows } = await db.query(
        `select * from project_invites where token = $1`,
        [req.params.token]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "invite not found" });
      if (rows[0].accepted_at || rows[0].declined_at) {
        return reply.status(409).send({ ok: false, error: "invite already responded to" });
      }

      await db.query(
        `update project_invites set declined_at = now() where id = $1`,
        [rows[0].id]
      );
      return { ok: true };
    }
  );

  // ── GET /api/v1/invites/org/:token ────────────────────────────────────────
  server.get<{ Params: { token: string } }>(
    "/api/v1/invites/org/:token",
    async (req, reply) => {
      const { rows } = await db.query(
        `select oui.*, o.name as org_name, o.slug as org_slug, u.name as invited_by_name
         from org_user_invites oui
         join organisations o on o.id = oui.org_id
         left join users u on u.id = oui.invited_by
         where oui.token = $1`,
        [req.params.token]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "invite not found" });
      const inv = rows[0];
      if (inv.expires_at < new Date()) return reply.status(410).send({ ok: false, error: "invite expired" });
      if (inv.accepted_at) return reply.status(409).send({ ok: false, error: "invite already accepted" });
      if (inv.declined_at) return reply.status(409).send({ ok: false, error: "invite already declined" });
      return { ok: true, invite: { ...inv, invite_url: `${APP_BASE_URL}/invite/org/${inv.token}` } };
    }
  );

  // ── POST /api/v1/invites/org/:token/accept ────────────────────────────────
  server.post<{ Params: { token: string } }>(
    "/api/v1/invites/org/:token/accept",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { rows } = await db.query(
        `select oui.*, o.name as org_name, o.slug as org_slug
         from org_user_invites oui
         join organisations o on o.id = oui.org_id
         where oui.token = $1`,
        [req.params.token]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "invite not found" });

      const inv = rows[0];
      if (inv.expires_at < new Date()) return reply.status(410).send({ ok: false, error: "invite expired" });
      if (inv.accepted_at) return reply.status(409).send({ ok: false, error: "already accepted" });
      if (inv.declined_at) return reply.status(409).send({ ok: false, error: "already declined" });

      if (inv.invitee_email && inv.invitee_email.toLowerCase() !== user.email.toLowerCase()) {
        return reply.status(403).send({ ok: false, error: "this invite is for a different email" });
      }

      // Add to org_user_members (upsert)
      await db.query(
        `insert into org_user_members (org_id, user_id, role)
         values ($1, $2, $3)
         on conflict (org_id, user_id) do update set role = excluded.role`,
        [inv.org_id, user.userId, inv.role]
      );

      // Mark accepted
      await db.query(
        `update org_user_invites set accepted_at = now() where id = $1`,
        [inv.id]
      );

      return { ok: true, org_name: inv.org_name, org_id: inv.org_id };
    }
  );

  // ── POST /api/v1/invites/org/:token/decline ───────────────────────────────
  server.post<{ Params: { token: string } }>(
    "/api/v1/invites/org/:token/decline",
    async (req, reply) => {
      const user = getRequestUser(req);
      if (!user) return reply.status(401).send({ ok: false, error: "not authenticated" });

      const { rows } = await db.query(
        `select * from org_user_invites where token = $1`,
        [req.params.token]
      );
      if (!rows[0]) return reply.status(404).send({ ok: false, error: "invite not found" });
      if (rows[0].accepted_at || rows[0].declined_at) {
        return reply.status(409).send({ ok: false, error: "invite already responded to" });
      }

      await db.query(
        `update org_user_invites set declined_at = now() where id = $1`,
        [rows[0].id]
      );
      return { ok: true };
    }
  );
}
