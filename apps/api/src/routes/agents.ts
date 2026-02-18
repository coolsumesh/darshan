import type { FastifyInstance } from "fastify";
import type pg from "pg";

export async function registerAgents(server: FastifyInstance, db: pg.Pool) {
  server.get("/api/v1/agents", async () => {
    const { rows } = await db.query(
      `select * from agents order by lower(name) asc`
    );
    return { ok: true, agents: rows };
  });

  server.get<{ Params: { id: string } }>(
    "/api/v1/agents/:id",
    async (req, reply) => {
      const { rows } = await db.query(
        `select * from agents where id = $1`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return reply.status(404).send({ ok: false, error: "agent not found" });
      }
      return { ok: true, agent: rows[0] };
    }
  );
}
