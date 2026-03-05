# OpenClaw Chat Bridge (Darshan Chat MVP)

## Purpose
Wire Darshan chat replies to real OpenClaw agent responses (instead of canned connector text).

## Current API behavior
`apps/api/src/connector.ts` now supports an optional bridge endpoint:
- Env: `OPENCLAW_CHAT_BRIDGE_URL`
- Optional bearer: `OPENCLAW_CHAT_BRIDGE_TOKEN`

When set, Darshan POSTs each queued run payload to the bridge:
```json
{
  "agent_id": "...",
  "agent_name": "Sanjaya",
  "thread_id": "...",
  "run_id": "...",
  "message": "user message"
}
```

Expected bridge response:
```json
{ "ok": true, "reply": "real agent reply text" }
```

If bridge fails/unset, Darshan falls back to canned response.

## Bridge service responsibilities
1. Receive Darshan run payload.
2. Map `agent_id` to OpenClaw session/agent route.
3. Send message into OpenClaw (session/tool/API path).
4. Return plain reply text as JSON.
5. Enforce auth using `OPENCLAW_CHAT_BRIDGE_TOKEN`.

## Minimal deployment steps (AWS)
1. Deploy bridge service reachable by Darshan API host.
2. Set API env vars:
   - `OPENCLAW_CHAT_BRIDGE_URL=https://<bridge-host>/darshan/chat`
   - `OPENCLAW_CHAT_BRIDGE_TOKEN=<strong-random-token>`
3. Restart `darshan-api` process.
4. Test from `/agents/chat`.

## Notes
- This is bridge-mode for MVP.
- Next step is full OpenClaw custom channel plugin (`channels.darshan`) as first-class transport.
