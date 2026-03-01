import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../db.js";

const JWT_SECRET       = process.env.JWT_SECRET         ?? "darshan-dev-secret-change-in-prod";
const COOKIE_NAME      = "darshan_token";
const COOKIE_MAX_AGE   = 60 * 60 * 24 * 7; // 7 days

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI  ??
  "https://darshan.caringgems.in/api/backend/api/v1/auth/google/callback";
const APP_BASE_URL         = process.env.APP_BASE_URL ?? "https://darshan.caringgems.in";

export type JwtPayload = { userId: string; email: string; name: string; role: string };

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Decode the session user from the darshan_token cookie on any request. */
export function getRequestUser(req: { cookies?: unknown }): JwtPayload | null {
  const token = (req.cookies as Record<string, string> | undefined)?.["darshan_token"];
  if (!token) return null;
  return verifyToken(token);
}

export async function registerAuth(server: FastifyInstance) {
  const db = getDb();

  // POST /api/v1/auth/login
  server.post<{ Body: { email?: string; password?: string } }>(
    "/api/v1/auth/login",
    async (req, reply) => {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        return reply.status(400).send({ ok: false, error: "email and password required" });
      }

      const { rows } = await db.query(
        `select id, email, name, role, password_hash from users where lower(email) = lower($1)`,
        [email.trim()]
      );
      if (!rows.length) {
        return reply.status(401).send({ ok: false, error: "invalid credentials" });
      }

      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return reply.status(401).send({ ok: false, error: "invalid credentials" });
      }

      const payload: JwtPayload = { userId: user.id, email: user.email, name: user.name, role: user.role };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
      });

      return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
    }
  );

  // POST /api/v1/auth/logout
  server.post("/api/v1/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  // GET /api/v1/auth/me — returns current session user (used by frontend)
  server.get("/api/v1/auth/me", async (req, reply) => {
    const token = (req.cookies as Record<string, string>)?.[COOKIE_NAME];
    if (!token) return reply.status(401).send({ ok: false, error: "not authenticated" });
    const payload = verifyToken(token);
    if (!payload) return reply.status(401).send({ ok: false, error: "invalid token" });
    // Fetch user from DB — also checks for forced session invalidation
    const { rows } = await db.query(
      `select avatar_url, sessions_invalidated_at from users where id = $1`,
      [payload.userId]
    );
    if (!rows.length) {
      // User deleted — clear cookie and reject
      reply.clearCookie(COOKIE_NAME, { path: "/" });
      return reply.status(401).send({ ok: false, error: "account not found" });
    }
    const { avatar_url, sessions_invalidated_at } = rows[0];
    // If the token was issued before the invalidation timestamp, force logout
    if (sessions_invalidated_at) {
      const iat = (payload as unknown as { iat?: number }).iat ?? 0;
      const invalidatedMs = new Date(sessions_invalidated_at).getTime();
      if (iat * 1000 < invalidatedMs) {
        reply.clearCookie(COOKIE_NAME, { path: "/" });
        return reply.status(401).send({ ok: false, error: "session invalidated" });
      }
    }
    return { ok: true, user: { ...payload, avatar_url: avatar_url ?? null } };
  });

  // DELETE /api/v1/auth/sessions/:userId — admin: force-logout a user
  server.delete<{ Params: { userId: string } }>(
    "/api/v1/auth/sessions/:userId",
    async (req, reply) => {
      const { userId } = req.params;
      await db.query(
        `update users set sessions_invalidated_at = now() where id = $1`,
        [userId]
      );
      return { ok: true, message: `Sessions invalidated for user ${userId}` };
    }
  );

  // ── Google OAuth 2.0 ────────────────────────────────────────────────────────

  // GET /api/v1/auth/google — redirect to Google consent screen
  server.get<{ Querystring: { next?: string } }>("/api/v1/auth/google", async (req, reply) => {
    if (!GOOGLE_CLIENT_ID) {
      return reply.redirect(`${APP_BASE_URL}/login?error=google_not_configured`, 302);
    }
    // Encode the post-login destination in the OAuth state so the callback can redirect there
    const state = req.query.next ? Buffer.from(req.query.next).toString("base64url") : "";
    const params = new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      redirect_uri:  GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope:         "openid email profile",
      access_type:   "offline",
      prompt:        "select_account",
      ...(state ? { state } : {}),
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
  });

  // GET /api/v1/auth/google/callback — exchange code, set cookie, redirect to app
  server.get<{ Querystring: { code?: string; error?: string; state?: string } }>(
    "/api/v1/auth/google/callback",
    async (req, reply) => {
      const { code, error, state } = req.query;
      // Decode the post-login destination from state (if any)
      let redirectAfter = `${APP_BASE_URL}/dashboard`;
      if (state) {
        try {
          const decoded = Buffer.from(state, "base64url").toString("utf8");
          // Only allow relative paths starting with / for safety
          if (decoded.startsWith("/")) redirectAfter = `${APP_BASE_URL}${decoded}`;
        } catch { /* ignore malformed state */ }
      }
      if (error || !code) {
        return reply.redirect(`${APP_BASE_URL}/login?error=google_denied`, 302);
      }

      // 1. Exchange code for tokens
      let tokens: { access_token?: string; id_token?: string };
      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body:    new URLSearchParams({
            code,
            client_id:     GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri:  GOOGLE_REDIRECT_URI,
            grant_type:    "authorization_code",
          }),
        });
        if (!tokenRes.ok) throw new Error("token exchange failed");
        tokens = await tokenRes.json() as { access_token?: string };
      } catch {
        return reply.redirect(`${APP_BASE_URL}/login?error=google_token`, 302);
      }

      // 2. Get Google user info
      let googleUser: { sub?: string; email?: string; name?: string; picture?: string };
      try {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!userRes.ok) throw new Error("userinfo failed");
        googleUser = await userRes.json() as { sub?: string; email?: string; name?: string; picture?: string };
      } catch {
        return reply.redirect(`${APP_BASE_URL}/login?error=google_userinfo`, 302);
      }

      const { sub: googleId, email, name, picture } = googleUser;
      if (!email || !googleId) {
        return reply.redirect(`${APP_BASE_URL}/login?error=google_no_email`, 302);
      }

      // 3. Find existing user by google_id or email, or auto-create
      const existing = await db.query(
        `select * from users where google_id = $1 or lower(email) = lower($2) limit 1`,
        [googleId, email]
      );

      let user: { id: string; email: string; name: string; role: string };
      if (existing.rows.length) {
        // Link google_id and refresh avatar on every login
        await db.query(
          `update users set google_id = $1, avatar_url = coalesce($2, avatar_url), updated_at = now() where id = $3`,
          [googleId, picture ?? null, existing.rows[0].id]
        );
        user = existing.rows[0];
      } else {
        // Auto-create — Google-only user, no password
        const { rows } = await db.query(
          `insert into users (email, name, google_id, avatar_url, role) values ($1, $2, $3, $4, 'admin') returning *`,
          [email, name ?? email.split("@")[0], googleId, picture ?? null]
        );
        user = rows[0];
      }

      // 4. Ensure the user has a linked human agent (create once if missing)
      const existing_agent = await db.query(
        `select id from agents where user_id = $1 limit 1`,
        [user.id]
      );
      if (!existing_agent.rows.length) {
        await db.query(
          `insert into agents (name, status, agent_type, user_id, ping_status, endpoint_type, endpoint_config, capabilities, callback_token)
           values ($1, 'online', 'human', $2, 'unknown', 'manual', '{}', '[]', gen_random_uuid()::text)
           on conflict do nothing`,
          [user.name, user.id]
        );
      }

      // 5. Issue JWT cookie and redirect to dashboard
      const payload: JwtPayload = { userId: user.id, email: user.email, name: user.name, role: user.role };
      const jwtToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

      reply.setCookie(COOKIE_NAME, jwtToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge:   COOKIE_MAX_AGE,
        path:     "/",
      });

      return reply.redirect(redirectAfter, 302);
    }
  );
}
