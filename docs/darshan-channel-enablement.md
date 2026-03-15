# Darshan Channel Enablement (OpenClaw)

Last updated: 2026-03-15

## Purpose
This document captures full Darshan channel wiring so future troubleshooting does not depend on chat memory.

## Install + Source Paths

### OpenClaw plugin runtime (active install)
- `C:\Users\ssume\.openclaw\extensions\darshan\index.ts`
- `C:\Users\ssume\.openclaw\extensions\darshan\openclaw.plugin.json`
- `C:\Users\ssume\.openclaw\extensions\darshan\package.json`

### OpenClaw plugin source path
- `C:\Users\ssume\.openclaw\workspace\darshan-channel-plugin\index.ts`

### OpenClaw config
- `C:\Users\ssume\.openclaw\openclaw.json`

## Required Config

```json
{
  "channels": {
    "darshan": {
      "enabled": true,
      "endpoint": "https://darshan.caringgems.in/api/backend",
      "apiKey": "<INTERNAL_API_KEY>",
      "agentId": "<SANJAYA_AGENT_ID>",
      "agentToken": "<SANJAYA_CALLBACK_TOKEN>"
    }
  }
}
```

> Critical: endpoint must include `/api/backend`.

## Backend Files and APIs

### Backend files
- `apps/api/src/routes/threads.ts`
- `apps/api/src/routes/notifications.ts`

### APIs used by channel
- `GET /api/v1/notifications?status=pending`
- `POST /api/v1/notifications/:id/process`
- `POST /api/v1/threads/:thread_id/messages`
- `POST /api/v1/threads/direct`
- `GET /api/v1/threads/:thread_id/messages/:message_id`
- `WS /ws`

## Web UI files (documentation surfacing)
- `apps/web/src/app/(proto)/threads/page.tsx`
- `apps/web/src/app/(proto)/threads/darshan-channel-enablement/page.tsx`

## Runtime Commands

```bash
openclaw status
openclaw gateway status
openclaw gateway restart
openclaw logs
```

## Known Failure Modes
- `delivered=false` even when notification is consumed
- WS reconnect loops (`non-101`/proxy)
- Missing `message_body`/`message_from` in WS payload
- Isolated `darshan:thread:*` session behavior causing no usable reply

## Receipt Ticks (Message Status Indicators)

**Status:** ✅ Shipped 2026-03-15

### Feature
Real-time delivery and read status indicators for sent messages:
- **Blue ✓✓** = All participants read
- **Purple ✓✓** = Some participants read
- **Gray ✓✓** = Delivered, none read yet
- **Gray ✓** = Sent only

### Files
- `apps/web/src/app/(proto)/threads/page.tsx`
  - `receiptTick()` function (color logic)
  - MessageBubble rendering
- `apps/api/src/routes/threads.ts`
  - `/threads/:id/messages/:msgId/delivered` endpoint
  - `/threads/:id/messages/:msgId/read` endpoint
  - Receipt summary calculation

### How It Works
1. Message is sent → receipt row created with `status='sent'`
2. Frontend calls `/delivered` when message renders → status → `delivered`
3. Frontend calls `/read` when user views thread → status → `read`
4. API counts receipts across all thread participants
5. UI renders color based on counts (all_read → all_delivered → some_read → sent)

### Testing
- Single message: should show **blue ✓✓** (all read)
- Multi-recipient, partial reads: should show **purple ✓✓**
- See `specs/feature-receipt-ticks-v1.md` for full test cases

## Verification Checklist
1. WS subscribe log visible for agent ID
2. Incoming thread message creates notification
3. Plugin receives populated sender/body fields
4. Reply writes into same thread
5. Notification transitions to `processed`
6. Message ticks render with correct color based on read status
