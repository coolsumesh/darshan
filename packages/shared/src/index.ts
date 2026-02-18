export const APP_NAME = "darshan" as const;

export type HealthResponse = {
  ok: true;
  service: string;
  time: string;
};

// ─── Domain types (mirror DB schema) ─────────────────────────────────────────

export type AgentStatus = "online" | "offline" | "unknown";

export type Agent = {
  id: string;
  name: string;
  status: AgentStatus;
  capabilities: Record<string, unknown>;
  connector_ref: string;
  created_at: string;
  updated_at: string;
};

export type ThreadVisibility = "private" | "shared";

export type Thread = {
  id: string;
  title: string | null;
  visibility: ThreadVisibility;
  created_by_user_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthorType = "human" | "agent" | "system";

export type Message = {
  id: string;
  seq: number;
  thread_id: string;
  author_type: AuthorType;
  author_user_id: string | null;
  author_agent_id: string | null;
  content: string;
  payload: Record<string, unknown>;
  run_id: string | null;
  created_at: string;
};

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout";

export type Run = {
  id: string;
  seq: number;
  thread_id: string;
  requested_by_type: "human" | "agent";
  requested_by_user_id: string | null;
  requested_by_agent_id: string | null;
  target_agent_id: string;
  status: RunStatus;
  input_message_id: string | null;
  trace_id: string | null;
  parent_run_id: string | null;
  delegation_path: string[];
  idempotency_key: string | null;
  started_at: string | null;
  ended_at: string | null;
  error_code: string | null;
  error_message: string | null;
  output_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type A2APolicy = "allowed" | "blocked" | "requires_human_approval";

export type A2ARoute = {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  policy: A2APolicy;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ─── WebSocket event envelope ─────────────────────────────────────────────────

export type WsEvent<T = unknown> = {
  type: string;
  ts: string;
  data: T;
};

export type WsMessageCreated = WsEvent<{ message: Message }>;
export type WsRunCreated    = WsEvent<{ run: Run }>;
export type WsRunUpdated    = WsEvent<{ run: Run }>;
