import type pg from "pg";

export type AuditActor =
  | { actor_type: "human"; actor_user_id: string; actor_agent_id?: null }
  | { actor_type: "agent"; actor_agent_id: string; actor_user_id?: null }
  | { actor_type: "system"; actor_user_id?: null; actor_agent_id?: null };

export type AppendAuditEventInput = {
  actor: AuditActor;
  action: string;

  resource_type: string;
  resource_id: string;

  thread_id?: string | null;
  run_id?: string | null;

  decision?: "allow" | "block" | "error" | null;
  reason?: string | null;

  metadata?: unknown;
};

export async function appendAuditEvent(db: pg.Pool, evt: AppendAuditEventInput) {
  const metadataJson = evt.metadata ?? {};

  const actor_user_id =
    evt.actor.actor_type === "human" ? evt.actor.actor_user_id : null;
  const actor_agent_id =
    evt.actor.actor_type === "agent" ? evt.actor.actor_agent_id : null;

  await db.query(
    `
      insert into audit_log (
        actor_type,
        actor_user_id,
        actor_agent_id,
        action,
        resource_type,
        resource_id,
        thread_id,
        run_id,
        decision,
        reason,
        metadata
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      evt.actor.actor_type,
      actor_user_id,
      actor_agent_id,
      evt.action,
      evt.resource_type,
      evt.resource_id,
      evt.thread_id ?? null,
      evt.run_id ?? null,
      evt.decision ?? null,
      evt.reason ?? null,
      metadataJson
    ]
  );
}

export type LlmFallbackEventInput = {
  actor: AuditActor;
  thread_id?: string | null;
  run_id?: string | null;

  attempted_provider: string;
  attempted_model: string;

  error_type: "http" | "timeout" | "network" | "unknown";
  http_status?: number;

  fallback_provider: string;
  fallback_model: string;
};

export async function recordLlmFallbackEvent(db: pg.Pool, input: LlmFallbackEventInput) {
  // action naming: "llm.fallback" used by ops endpoint
  await appendAuditEvent(db, {
    actor: input.actor,
    action: "llm.fallback",
    resource_type: "run",
    resource_id: input.run_id ?? "unknown",
    thread_id: input.thread_id ?? null,
    run_id: input.run_id ?? null,
    decision: "error",
    reason: "provider_error_fallback",
    metadata: {
      attempted: {
        provider: input.attempted_provider,
        model: input.attempted_model
      },
      error: {
        type: input.error_type,
        http_status: input.http_status ?? null
      },
      fallback: {
        provider: input.fallback_provider,
        model: input.fallback_model
      }
    }
  });
}
