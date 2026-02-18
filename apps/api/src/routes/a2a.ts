import type { FastifyInstance } from "fastify";
import type pg from "pg";

export async function registerA2A(server: FastifyInstance, db: pg.Pool) {
  // List all A2A routes
  server.get("/api/v1/a2a/routes", async () => {
    const { rows } = await db.query(
      `select r.*,
              fa.name as from_agent_name,
              ta.name as to_agent_name
       from a2a_routes r
       join agents fa on fa.id = r.from_agent_id
       join agents ta on ta.id = r.to_agent_id
       order by fa.name asc, ta.name asc`
    );
    return { ok: true, routes: rows };
  });

  // Create or update an A2A route
  server.post<{
    Body: {
      from_agent_id: string;
      to_agent_id: string;
      policy: "allowed" | "blocked" | "requires_human_approval";
      notes?: string;
    };
  }>("/api/v1/a2a/routes", async (req, reply) => {
    const { from_agent_id, to_agent_id, policy, notes } = req.body ?? {};

    if (!from_agent_id || !to_agent_id || !policy) {
      return reply.status(400).send({
        ok: false,
        error: "from_agent_id, to_agent_id, and policy are required",
      });
    }

    if (from_agent_id === to_agent_id) {
      return reply.status(400).send({
        ok: false,
        error: "from_agent_id and to_agent_id must differ",
      });
    }

    const { rows } = await db.query(
      `insert into a2a_routes (from_agent_id, to_agent_id, policy, notes)
       values ($1, $2, $3, $4)
       on conflict (from_agent_id, to_agent_id)
       do update set policy = excluded.policy, notes = excluded.notes, updated_at = now()
       returning *`,
      [from_agent_id, to_agent_id, policy, notes ?? null]
    );

    return { ok: true, route: rows[0] };
  });
}
