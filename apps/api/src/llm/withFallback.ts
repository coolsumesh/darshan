import type pg from "pg";
import { recordLlmFallbackEvent, type AuditActor } from "../audit.js";

export type ProviderModel = { provider: string; model: string };

export type FallbackContext = {
  actor: AuditActor;
  thread_id?: string | null;
  run_id?: string | null;
};

export async function withProviderFallback<T>(opts: {
  db: pg.Pool;
  ctx: FallbackContext;
  attempted: ProviderModel;
  fallback: ProviderModel;
  fn: () => Promise<T>;
  onFallback: () => Promise<T>;
}): Promise<T> {
  try {
    return await opts.fn();
  } catch (err: any) {
    const httpStatus: number | undefined =
      typeof err?.status === "number"
        ? err.status
        : typeof err?.statusCode === "number"
          ? err.statusCode
          : undefined;

    const errorType: "http" | "timeout" | "network" | "unknown" =
      typeof httpStatus === "number"
        ? "http"
        : err?.name === "AbortError" || err?.code === "ETIMEDOUT"
          ? "timeout"
          : err?.code
            ? "network"
            : "unknown";

    // Only record when we are actually falling back.
    await recordLlmFallbackEvent(opts.db, {
      actor: opts.ctx.actor,
      thread_id: opts.ctx.thread_id ?? null,
      run_id: opts.ctx.run_id ?? null,
      attempted_provider: opts.attempted.provider,
      attempted_model: opts.attempted.model,
      error_type: errorType,
      http_status: httpStatus,
      fallback_provider: opts.fallback.provider,
      fallback_model: opts.fallback.model
    });

    return await opts.onFallback();
  }
}
