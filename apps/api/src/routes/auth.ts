import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "darshan-dev-secret-change-in-prod";
const COOKIE_NAME = "darshan_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type JwtPayload = { userId: string; email: string; name: string; role: string };

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
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
    return { ok: true, user: payload };
  });
}
