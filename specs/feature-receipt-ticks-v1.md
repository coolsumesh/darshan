# Feature: Receipt Ticks (Read Status Indicators)

**Status:** ✅ Shipped  
**Date:** 2026-03-15  
**Commits:** 9978313, e718bf8

## Overview

Message receipt ticks show real-time delivery and read status for messages you send in threads. Visual color coding indicates:

- **Blue ✓✓** = All participants have read the message
- **Purple ✓✓** = Some participants have read the message
- **Gray ✓✓** = Message delivered to all, but none have read it yet
- **Gray ✓** = Message sent only (awaiting delivery)

## Implementation

### Components

1. **Receipt Summary Calculation** (`/api/v1/threads/:id/messages/:msgId/delivered|read`)
   - Counts delivery and read status across all thread participants
   - Returns: `sent_count`, `delivered_count`, `read_count`, `total_recipients`
   - Boolean flags: `all_sent`, `all_delivered`, `all_read`

2. **Tick Renderer** (`apps/web/src/app/(proto)/threads/page.tsx`)
   - Function: `receiptTick(summary)` → returns `{ icon, color, title }`
   - Always renders if `msg.receipt_summary` exists
   - Color logic prioritizes read > delivered > sent

3. **Message Marking** (Automatic)
   - `/delivered` endpoint called when message renders on screen
   - `/read` endpoint called when user views the thread containing the message
   - Both fired automatically on page load via `fetchThreadMessages()`

### Color Logic (Priority Order)

```javascript
if (all_read)           → Blue ✓✓
else if (read_count > 0)  → Purple ✓✓
else if (all_delivered) → Gray ✓✓
else if (delivered > 0) → Gray ✓✓
else                    → Gray ✓
```

### UX Placement

Ticks appear inline with message metadata:
```
[Sender Name] [Time] [TICKS] [Message ID]
```

Example:
```
SUMESH_SUKUMARAN just now ✓✓ 99a37fb2
```

Tooltip shows detailed breakdown:
- `"Read by 3/3"` (all read)
- `"Read by 2/3"` (some read)  
- `"Delivered to 3/3"` (all delivered, none read)
- `"Sent"` (awaiting delivery)

## Testing

**Test Case 1: Single Recipient (You + Coordinator)**
- Send message in thread with 2 participants
- You auto-read → Blue ✓✓

**Test Case 2: Multi-Recipient with Partial Reads**
- Thread with 3+ participants
- You send message
- Some but not all participants read it → Purple ✓✓
- All participants read → Blue ✓✓

**Test Case 3: Delivery-Only State**
- Message to participants who haven't viewed thread yet
- Shows Gray ✓✓ (delivered) until they open the message

## Known Limitations

- Ticks only render for **your own messages** (sender-side receipts)
- Requires thread participant read tracking (delivery/read timestamps)
- Color changes require page refresh or polling (no WebSocket subscriptions yet)

## Future Enhancements

- [ ] WebSocket-based real-time updates (no refresh needed)
- [ ] Recipient avatars on hover (show who read)
- [ ] Per-recipient delivery tracking (not just counts)
- [ ] Read receipts for received messages (show when you've been read)

---

**Files Changed:**
- `apps/web/src/app/(proto)/threads/page.tsx`
  - `receiptTick()` function (color logic)
  - MessageBubble rendering (conditional tick display)

**Tested:** ✅ Darshan thread b030887c-eeb6-4d71-98b5-bfb1571b6b0b
