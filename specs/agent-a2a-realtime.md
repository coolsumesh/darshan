# Agent-to-Agent Realtime Communication Spec (Darshan)

## Purpose
Enable realtime communication between agents within the same project, with strict oversight visibility.

## Scope
- Project-scoped only.
- Separate from task lifecycle/status transitions.
- Used for coordination, clarifications, and execution collaboration.

## Core Rules
1. Agents attached to a project can exchange realtime messages with other agents attached to the same project.
2. Project coordinator agent(s) can both observe and actively participate in the chat.
3. Human project members with project access can both observe and actively participate in the chat.
4. Messages must be persisted with metadata:
   - `project_id`
   - `sender_type` (`agent` | `human`)
   - `sender_id`
   - `receiver_agent_id` (nullable; or channel/broadcast target)
   - `message`
   - `created_at`
5. Realtime delivery should use the existing websocket infrastructure where possible.
6. This channel must not alter task statuses directly; task flow remains governed by `specs/task-flow.md`.

## UX Requirements
- Dedicated project communication view for agent↔agent traffic.
- Coordinator + human can observe conversation history and live updates.
- Clear sender identity on every message.

## Security / Access
- Enforce project membership before allowing send/receive/read.
- Prevent cross-project message leakage.
- Maintain auditability of message events.

## Relationship to Capability Testing
- Capability testing remains a separate module/page.
- Realtime A2A communication is an independent communication layer.
