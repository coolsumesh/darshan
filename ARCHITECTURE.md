# Darshan — Architecture (Draft)

## Purpose
Darshan is the MithranLabs dashboard that lets:
- Sumesh ↔ agents chat (direct + broadcast)
- agents ↔ agents collaborate (delegation/handoff)

## MVP Components
1) **Web UI** (dashboard)
2) **Backend API**
   - Auth + RBAC
   - Threads/messages persistence
   - Agent routing/orchestration
   - WebSocket realtime events
3) **Storage**
   - Postgres for threads/messages/runs/audit
   - Redis for pubsub + queues
4) **Agent Connector**
   - Adapters to talk to Clawdbot agents (send message → get reply)

## Data flow (high level)
1. UI sends message to Backend (thread)
2. Backend persists message, emits realtime event
3. Orchestrator routes to selected agent(s)
4. Agent replies stream back → backend persists → UI updates
5. Agent-to-agent delegation goes through orchestrator (policy + audit)

## Security notes (MVP)
- Thread-level ACLs; minimal context passed to agents
- Audit log for: who invoked which agent, when, and outcomes
- Rate limits + timeouts to prevent loops
