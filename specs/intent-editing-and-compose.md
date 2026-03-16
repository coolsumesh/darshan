# Spec: Intent Editing & Compose Toggle

**Date:** 2026-03-16  
**Status:** Draft  
**Owner:** Sumesh

---

## Overview

Add ability for users to:
1. Choose intent when composing (`question` vs `thought`)
2. Edit message intents after sending
3. Mark questions as unanswered
4. Mark agent answers as wrong

---

## New Intent Types

Add to `MESSAGE_INTENTS`:

```
"wrong_answer"    // That answer was incorrect / didn't work
"unanswered"      // This question was never answered
"thought"         // I'm thinking / analyzing (can be used by agents too)
```

**Total intents: 11**

---

## Feature 1: Compose Intent Toggle

### UI (Message Compose Box)

```
┌────────────────────────────────────────┐
│ [Type your message here...]            │
│                                        │
│ Intent:  ◉ question  ○ thought        │ ← Toggle (radio buttons)
│          (default)   (thinking)        │
│                                        │
│ [Attachments]              [Send]     │
└────────────────────────────────────────┘
```

### Behavior

**Default: `question`**
- Used when user has something to ask/request/test
- Signals that a response might be needed

**Toggle to: `thought`**
- Used when user is capturing ideas/analysis without needing response
- Same as "thinking out loud"
- Broadcasts intent clearly before sending

### API Change

POST `/threads/{id}/messages`

```json
{
  "body": "Let me think about this approach",
  "intents": ["thought"]  // User explicitly set this
}
```

If not specified, default behavior:
- User: `question`
- Agent: `answer`

---

## Feature 2: Intent Editing (Post-Send)

### UI (Message Header)

Current:
```
SUMESH  2m ago  [answer]  abc12345
```

With edit button:
```
SUMESH  2m ago  [answer] [✎ edit]  abc12345
                            ↑
                       Click to open menu
```

### Edit Menu (Modal/Dropdown)

When user clicks `[✎ edit]`:

```
┌─────────────────────────────────┐
│ Edit Intent                     │
├─────────────────────────────────┤
│ Current: [answer]               │
│                                 │
│ Change to:                      │
│ ☐ question                      │
│ ☐ clarification                 │
│ ☐ thought                       │
│ ☐ answer (current)              │
│ ☐ wrong_answer  ← NEW           │
│ ☐ disagreement                  │
│ ☐ suggestion                    │
│ ☐ should_i                      │
│ ☐ blocked                       │
│ ☐ unanswered    ← NEW           │
│ ☐ work_confirmation             │
│                                 │
│ [Cancel]  [Save]                │
└─────────────────────────────────┘
```

**Multi-select:** Can add multiple intents (e.g., `[answer, work_confirmation]`)

### API for Edit

```
PATCH /threads/{id}/messages/{msg_id}
{
  "intents": ["answer", "work_confirmation"]  // Replace entire intents array
}
```

Response:
```json
{
  "ok": true,
  "message": {
    "message_id": "...",
    "intents": ["answer", "work_confirmation"],
    ...
  }
}
```

---

## Feature 3: Mark Question as Unanswered

### Use Case

User asks a question. No one responds adequately. User wants to mark it as still unanswered.

### UI

**Option A: In edit menu**
- Open intent editor
- Check `unanswered`
- Save

**Option B: Context menu**
- Right-click message → "Mark as unanswered"
- Auto-adds `unanswered` intent

**Recommendation: Use Option A** (via edit button) — consistent with other intent changes

### Example Flow

```
SUMESH  5m ago  [question]  abc12345
Can you fix the database migration?

← User clicks [✎ edit]
← Checks [unanswered]
← Saves

SUMESH  5m ago  [question] [unanswered]  abc12345
Can you fix the database migration?
```

---

## Feature 4: Mark Answer as Wrong

### Use Case

Agent (or user) gives an answer. It turns out wrong. User marks it as such.

### UI

Same as Feature 3 — use edit button:
- Open intent editor
- Check `wrong_answer` (can keep `answer` or replace)
- Save

### Example Flow

```
SANJAYA  3m ago  [answer]  def67890
Yes, just run migration 069...

← Later, user tries it and it fails

SUMESH  1m ago  [✎ edit on SANJAYA's message]
← Checks [wrong_answer]
← Saves

SANJAYA  3m ago  [answer] [wrong_answer]  def67890
Yes, just run migration 069...
```

---

## Database Changes

### New Migration

```sql
-- Add intent editing capability
-- intents column already exists (JSONB array)
-- No schema changes needed

-- But add audit trail (optional, can defer):
CREATE TABLE message_intent_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  edited_by_user_id UUID NOT NULL,
  old_intents JSONB,
  new_intents JSONB,
  edited_at TIMESTAMPTZ DEFAULT now()
);
```

**For now: Skip audit trail**. Just update intents directly.

---

## API Endpoints

### 1. POST /threads/{id}/messages (Existing)

**Change:**
- Accept optional `intents` array in body
- Default to user behavior if not specified

```json
{
  "body": "My thought",
  "intents": ["thought"]  ← NEW: optional
}
```

### 2. PATCH /threads/{id}/messages/{msg_id} (NEW)

**Edit message intents**

```
PATCH /api/v1/threads/{thread_id}/messages/{message_id}
{
  "intents": ["answer", "work_confirmation"]
}
```

Response:
```json
{
  "ok": true,
  "message": {
    "message_id": "...",
    "intents": ["answer", "work_confirmation"],
    "updated_at": "2026-03-16T..."
  }
}
```

**Validation:**
- User must have at least `creator` or `editor` role in thread
- Agent can only edit their own messages
- User can edit any message in their thread

---

## Frontend Components

### 1. Compose Intent Toggle

**File:** `apps/web/src/components/ComposeIntentToggle.tsx`

Props:
```typescript
{
  selectedIntent: "question" | "thought"
  onChange: (intent: "question" | "thought") => void
}
```

Display:
```
Intent:  ◉ question  ○ thought
```

### 2. Intent Edit Modal

**File:** `apps/web/src/components/IntentEditModal.tsx`

Props:
```typescript
{
  isOpen: boolean
  currentIntents: ThreadMessageIntent[]
  onClose: () => void
  onSave: (intents: ThreadMessageIntent[]) => Promise<void>
}
```

Display:
- Checkbox list of all 11 intents
- Current intents pre-checked
- Cancel/Save buttons

### 3. Message Header with Edit Button

**Update:** `apps/web/src/app/(proto)/threads/page.tsx`

Current message header:
```
SENDER  time ago  [intents]  message_id
```

Add edit button:
```
SENDER  time ago  [intents] [✎ edit]  message_id
                                 ↑
                            onClick → open modal
```

---

## Color Updates

Add colors for new intents:

```typescript
const intentColors: Record<Intent, { bg: string; text: string }> = {
  // ... existing
  wrong_answer: { bg: "bg-orange-100", text: "text-orange-700" },  // Orange
  unanswered: { bg: "bg-yellow-100", text: "text-yellow-700" },    // Yellow
  thought: { bg: "bg-slate-100", text: "text-slate-700" },         // Gray (already exists)
};
```

---

## Implementation Order

1. **Backend First:**
   - Add new intents to MESSAGE_INTENTS
   - Add PATCH endpoint for intent editing
   - Validation logic

2. **Frontend:**
   - Create ComposeIntentToggle component
   - Create IntentEditModal component
   - Update message header with edit button
   - Wire up to API calls

3. **Testing:**
   - User: Send question → toggle to thought → send
   - User: Send question → edit to unanswered
   - Agent: Send answer → user edits to wrong_answer
   - Multi-intent: Send answer → user adds work_confirmation

---

## Edge Cases

**Q: Can I remove all intents from a message?**
A: No. Every message must have at least 1 intent. If user unchecks all, show error.

**Q: Can agent edit their own message intents?**
A: Yes. Agent can send `answer`, then user can edit to `wrong_answer`. Agent can also edit their own (for fixes).

**Q: Does editing intents update timestamps?**
A: No. Keep original `sent_at`. Only update `intents` JSONB field.

**Q: Notifications on intent change?**
A: Not required for v1. Can add later if needed.

**Q: Can I bulk-edit intents on multiple messages?**
A: No. Single message only for v1.

---

## Success Criteria

- ✅ User can toggle `question` ↔ `thought` when composing
- ✅ User can edit any message's intents via modal
- ✅ Agent defaults to `answer`, can send `thought` explicitly
- ✅ User can mark questions as `unanswered`
- ✅ User can mark answers as `wrong_answer`
- ✅ All 11 intents display with correct colors
- ✅ Edit button visible on message headers
- ✅ API validation prevents invalid states

---

## Deferred (Future)

- Audit trail (message_intent_edits table)
- Bulk intent editing
- Intent change notifications
- Intent statistics/analytics
- LLM-assisted intent suggestions
