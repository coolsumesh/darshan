# Profile hygiene (daily)

Goal: keep every Darshan agent’s **profile context** fresh so the system stays coherent over time.

## What each agent must update daily
Each agent updates (at least a small delta) in their own workspace:
- `USER.md` — what we learned about Sumesh / project needs
- `IDENTITY.md` — identity/role/vibe updates if changed
- `MEMORY.md` (or `memory/YYYY-MM-DD.md` if you’re using daily notes) — durable progress + decisions

## Reminder schedule
- **Daily at 9:00 PM PST** (gentle end‑of‑day routine)
- **Optional second ping at 9:30 AM PST** (if they missed the prior day)

## Reminder message template
Subject: Daily profile update reminder

Body:
1) Update `USER.md` with anything learned today.
2) Update `IDENTITY.md` if your role/vibe/tools changed.
3) Update `MEMORY.md` (or `memory/YYYY-MM-DD.md`) with decisions, progress, blockers.
4) Reply “done” when finished.

## How to deliver reminders (implementation options)
### Option A — lightweight (prototype)
- Mithran runs a daily cron that **spawns a short “nudge” task** to each agent session.
- Agents update their files and respond.
- Mithran collects replies + reports compliance.

### Option B — durable + measurable (recommended for Darshan)
- Add a backend job that periodically reads each agent workspace file mtimes (or git commit timestamps) for:
  - `USER.md`, `IDENTITY.md`, `MEMORY.md`
- Compute `profile_last_updated_at = max(mtime)` and store in DB.
- Expose via API: `GET /api/v1/agents` includes `profileLastUpdatedAt`.
- UI shows relative time (“updated 3h ago”) + flags stale (“>24h”).

## Dashboard feature: “Profile last updated”
Display per agent:
- `profileLastUpdatedAt` (relative)
- status pill:
  - **Fresh** (<24h)
  - **Stale** (24–72h)
  - **Outdated** (>72h)

## Status report expectation
- Daily: Mithran posts a small compliance summary to Sumesh (who’s stale / who’s fresh).
- Weekly: a simple trend chart (optional).
