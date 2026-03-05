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

## Implemented service (2026-03-05)
- App path: `apps/chat-bridge`
- Endpoint: `POST /darshan/chat`
- Health: `GET /health`
- Upstream mode: calls OpenClaw Responses-compatible API at `${OPENCLAW_BASE_URL}/v1/responses`
- Auth: bearer token via `OPENCLAW_CHAT_BRIDGE_TOKEN`

## Bridge service responsibilities
1. Receive Darshan run payload.
2. Map `agent_id` to OpenClaw session/agent route (current MVP uses `agent_name` as persona prompt; deeper session mapping can be added next).
3. Send message into OpenClaw API.
4. Return plain reply text as JSON.
5. Enforce auth using `OPENCLAW_CHAT_BRIDGE_TOKEN`.

## Minimal deployment steps (AWS)
1. Build + run bridge service:
   - `pnpm -C apps/chat-bridge build`
   - `pnpm -C apps/chat-bridge start`
2. Set bridge env:
   - `OPENCLAW_CHAT_BRIDGE_TOKEN=<strong-random-token>`
   - `OPENCLAW_BASE_URL=http://127.0.0.1:3000` (or your gateway URL)
   - `OPENCLAW_API_KEY=<if required by gateway auth>`
   - `OPENCLAW_MODEL=gpt-mini` (optional)
3. Set Darshan API env vars:
   - `OPENCLAW_CHAT_BRIDGE_URL=https://<bridge-host>/darshan/chat`
   - `OPENCLAW_CHAT_BRIDGE_TOKEN=<same-strong-random-token>`
4. Restart `darshan-api` process.
5. Test from `/agents/chat`.

## Notes
- This is bridge-mode for MVP.
- Next step is full OpenClaw custom channel plugin (`channels.darshan`) as first-class transport.
