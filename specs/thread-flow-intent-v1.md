# Thread Flow + Intent-First Threads (v1)

## Owner
Sanjaya

## Requested by
Sumesh

## Decision
Replace default thread behavior with an **intent-first flow model**.
No backward compatibility mode.

---

## Problem
Current thread API/UI shows messages and participants, but not the explicit coordination path:
- who handed work to whom
- why each message exists (question/answer/blocked/etc.)
- who is expected to respond next

---

## Product Goal
A thread should read as a coordination chain:

`Created -> Sumesh -> Mithran/Sanjaya -> Sumesh -> Sanjaya [awaiting Sumesh] -> Sumesh -> Sanjaya`

Each step must carry semantic intent.

---

## Contract Changes

### `thread_messages` new fields
- `intent` (required)
- `intent_confidence` (optional, 0..1)
- `awaiting_on` (required: `user | agent | none`)
- `next_expected_from` (optional)

### `intent` enum v1
- `greeting`
- `question`
- `answer`
- `suggest`
- `work_confirmation`
- `status_update`
- `review_request`
- `blocked`
- `closure`

### Rules
1. Agent/system messages must include `intent`.
2. `blocked` and `review_request` must include:
   - `awaiting_on != none`
   - `next_expected_from`
3. Invalid intent metadata returns `400`.

---

## API Behavior

### POST `/api/v1/threads/:id/messages`
Accept and validate intent metadata.

### GET `/api/v1/threads/:id`
Return `flow` by default:
- ordered path
- event intent per step
- current `awaiting_on`
- `next_expected_from`

`flow.path[]` fields:
- `seq`
- `event_type`
- `from_actor`
- `to_actor`
- `message_id`
- `created_at`
- `awaiting_on`
- `next_expected_from`

---

## DB Migration
Migration: `apps/api/migrations/066_thread_message_intent_flow.sql`
- add columns
- backfill existing rows
- enforce constraints
- add index for flow reads

---

## UI Notes (next step)
Thread detail should render a first-class flow rail using `flow.path`:
- arrows between actors
- intent badges (Q/A/Blocked/Confirm)
- awaiting badge (`Awaiting Sumesh` etc.)
- click node -> jump to message

---

## Acceptance Criteria
1. New agent replies without `intent` are rejected.
2. Thread details return flow path in order.
3. Current expected responder is explicit from API.
4. Example thread `698a08b7-dfff-4feb-b1d5-662ca7f9573f` can be represented as readable flow.

---

## Implementation Status
- [x] Spec created
- [x] API model + validation started
- [x] Migration added
- [ ] Web flow rail rendering
- [ ] Agent SDK helpers for intent payloads
