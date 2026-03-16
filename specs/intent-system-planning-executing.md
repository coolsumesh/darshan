# Spec: Intent System with Planning & Executing Modes

**Date:** 2026-03-16  
**Status:** Final  
**Owner:** Sumesh

---

## Overview

Implement a dual-mode conversation system:
- **Planning Mode** — discussing, analyzing, ideating (background color change)
- **Executing Mode** — building, implementing, delivering (default)

Both modes support the same intents and modifiers. Mode is a **context label** for the conversation, not a filter.

---

## Intent Model

### Base Intents (3)

All messages must have exactly **1 base intent**:

1. **`request`** — greeting, question, instruction, anything needing a response
   - "Fix the database migration"
   - "What do you think about this approach?"
   - "Let me try this solution"

2. **`response`** — answering/responding to a request
   - "Here's the fix..."
   - "I think that approach works because..."
   - "I've completed the task"

3. **`thinking`** — analyzing, working through, no response needed
   - "Let me work through this..."
   - "I'm brainstorming ideas..."
   - "Analyzing the problem..."

### Status Modifiers (2, Optional)

Can be **added to any base intent** (0, 1, or 2 modifiers per message):

1. **`not_handled`** — request/task hasn't been addressed yet
   - Example: `[request, not_handled]` — "Can someone fix this? (still waiting)"
   - Example: `[response, not_handled]` — "I attempted this but it's incomplete"

2. **`handled_incorrectly`** — response/work was done but incorrectly
   - Example: `[response, handled_incorrectly]` — "That fix doesn't work"
   - Example: `[request, handled_incorrectly]` — "The previous solution was wrong"

---

## Modes

### Planning Mode [P]

**Visual Cues:**
- Background: Light blue/gray (#E0F2FE or similar)
- Header indicator: "PLANNING MODE"
- Keyboard shortcut: `Shift + Tab` to toggle

**Behavior:**
- Same intents available
- Same modifiers available
- Signals: "We're discussing/planning/ideating"
- Use case: Spec discussions, design, approach decisions

**Example:**
```
PLANNING MODE
┌───────────────────────────────────────┐
│ [Type your message...]                │
│                                       │
│ Base Intent:                          │
│ ◉ request  ○ response  ○ thinking    │
│                                       │
│ Modifiers:                            │
│ ☐ not_handled  ☐ handled_incorrectly │
│                                       │
│ [Send]  [Shift+Tab to Execute]      │
└───────────────────────────────────────┘
```

### Executing Mode [E]

**Visual Cues:**
- Background: Normal (white)
- Header indicator: "EXECUTING MODE"
- Keyboard shortcut: `Shift + Tab` to toggle (default mode)

**Behavior:**
- Same intents available
- Same modifiers available
- Signals: "We're building/implementing/delivering"
- Use case: Building features, fixing bugs, delivery

**Example:**
```
EXECUTING MODE
┌───────────────────────────────────────┐
│ [Type your message...]                │
│                                       │
│ Base Intent:                          │
│ ◉ request  ○ response  ○ thinking    │
│                                       │
│ Modifiers:                            │
│ ☐ not_handled  ☐ handled_incorrectly │
│                                       │
│ [Send]  [Shift+Tab to Plan]          │
└───────────────────────────────────────┘
```

---

## Compose Behavior

### Default Intent Assignment

**User (Sumesh):**
- Base intent defaults to `request`
- Can toggle to `response` or `thinking`

**Agent (Sanjaya):**
- Base intent defaults to `response`
- Can toggle to `request` or `thinking`

### Multi-Intent Support

Example sends:
```json
// Planning mode, thinking
{
  "body": "Let me work through this approach",
  "intents": ["thinking"]
}

// Executing mode, request with modifier
{
  "body": "Can someone fix this? (still waiting)",
  "intents": ["request", "not_handled"]
}

// Executing mode, response with modifier
{
  "body": "That fix doesn't work",
  "intents": ["response", "handled_incorrectly"]
}
```

---

## Message Header UI

### Display

Current (no changes):
```
SUMESH  2m ago  [request] [not_handled]  abc12345
```

With edit button:
```
SUMESH  2m ago  [request] [not_handled] [✎ edit]  abc12345
                                             ↑
                                        Click to edit
```

### Intent Edit Modal

When user clicks `[✎ edit]`:

```
┌─────────────────────────────────────┐
│ Edit Intent                         │
├─────────────────────────────────────┤
│ Current: [request] [not_handled]    │
│                                     │
│ Base Intent (pick one):             │
│ ◉ request                           │
│ ○ response                          │
│ ○ thinking                          │
│                                     │
│ Modifiers (optional):               │
│ ☐ not_handled                       │
│ ☐ handled_incorrectly               │
│                                     │
│ [Cancel]  [Save]                    │
└─────────────────────────────────────┘
```

**Rules:**
- Exactly 1 base intent required
- 0, 1, or 2 modifiers optional
- Save triggers API update

---

## Colors

### Base Intents

```typescript
const baseIntentColors: Record<string, { bg: string; text: string }> = {
  request: { bg: "bg-blue-100", text: "text-blue-700" },
  response: { bg: "bg-green-100", text: "text-green-700" },
  thinking: { bg: "bg-amber-100", text: "text-amber-700" },
};
```

### Modifiers

```typescript
const modifierColors: Record<string, { bg: string; text: string }> = {
  not_handled: { bg: "bg-yellow-100", text: "text-yellow-700" },
  handled_incorrectly: { bg: "bg-red-100", text: "text-red-700" },
};
```

### Mode Background

```typescript
const modeBackground = {
  planning: "bg-blue-50",      // Light blue
  executing: "bg-white",        // Normal
};
```

---

## API Endpoints

### 1. POST /threads/{id}/messages (Existing, Updated)

**Send a message with intents:**

```
POST /api/v1/threads/{thread_id}/messages
{
  "body": "Let me work through this",
  "intents": ["thinking"]      // NEW: optional array
}
```

**Response:**
```json
{
  "ok": true,
  "message_id": "...",
  "message": {
    "message_id": "...",
    "intents": ["thinking"],
    "sent_at": "...",
    ...
  }
}
```

**Validation:**
- At least 1 base intent required
- Modifiers optional
- Default behavior if intents not provided:
  - User → `request`
  - Agent → `response`

### 2. PATCH /threads/{id}/messages/{msg_id} (NEW)

**Edit message intents after sending:**

```
PATCH /api/v1/threads/{thread_id}/messages/{message_id}
{
  "intents": ["response", "handled_incorrectly"]
}
```

**Response:**
```json
{
  "ok": true,
  "message": {
    "message_id": "...",
    "intents": ["response", "handled_incorrectly"],
    "updated_at": "2026-03-16T...",
    ...
  }
}
```

**Validation:**
- Caller must be message author or thread creator
- At least 1 base intent required
- Max 2 modifiers

### 3. GET /threads/{id}/messages (Existing, Updated)

**Filter by intents (optional):**

```
GET /api/v1/threads/{thread_id}/messages?intents=request&intents=not_handled
```

Returns messages where intents array contains both `request` AND `not_handled`.

---

## Frontend Components

### 1. Mode Toggle Indicator

**File:** `apps/web/src/components/ModeToggle.tsx`

Props:
```typescript
{
  mode: "planning" | "executing"
  onChange: (mode: "planning" | "executing") => void
}
```

Display:
```
PLANNING MODE [P]     or     EXECUTING MODE [E]
```

Keyboard shortcut handled globally.

### 2. Intent Selector (Compose)

**File:** `apps/web/src/components/IntentSelector.tsx`

Props:
```typescript
{
  baseIntent: "request" | "response" | "thinking"
  modifiers: ("not_handled" | "handled_incorrectly")[]
  onBaseIntentChange: (intent: string) => void
  onModifiersChange: (modifiers: string[]) => void
}
```

Display:
- Radio buttons: request, response, thinking
- Checkboxes: not_handled, handled_incorrectly

### 3. Intent Edit Modal

**File:** `apps/web/src/components/IntentEditModal.tsx`

Props:
```typescript
{
  isOpen: boolean
  currentIntents: string[]
  onClose: () => void
  onSave: (intents: string[]) => Promise<void>
}
```

Display:
- Same as IntentSelector but in modal form
- Cancel / Save buttons

### 4. Message Header with Edit

**Update:** `apps/web/src/app/(proto)/threads/page.tsx`

Current:
```
SENDER  time ago  [intents]  message_id
```

Updated:
```
SENDER  time ago  [intents] [✎ edit]  message_id
```

Click edit → open IntentEditModal

### 5. Compose Box with Mode Context

**Update:** `apps/web/src/app/(proto)/threads/page.tsx`

Add:
- Mode toggle (`P`/`E` keyboard shortcuts)
- Background color based on mode
- Intent selector component
- Send button

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Shift + Tab` | Toggle between Planning & Executing modes |
| `Cmd/Ctrl + Enter` | Send message (existing) |

---

## State Management

### Thread Mode (UI State, not persisted)

```typescript
const [threadMode, setThreadMode] = useState<"planning" | "executing">("executing");

// Toggle on Shift+Tab keypress
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      setThreadMode(prev => prev === "planning" ? "executing" : "planning");
    }
  };
  window.addEventListener("keydown", handleKeyPress);
  return () => window.removeEventListener("keydown", handleKeyPress);
}, []);
```

**Note:** Mode is per-thread, per-session. Not saved to DB.

---

## Database Changes

### New Migration

```sql
-- Migration 069: Intent system with modifiers
-- intents column already exists from migration 068

-- Add intent edit tracking (optional, deferred):
-- CREATE TABLE message_intent_edits (...)

-- For now: Just update existing intents array
```

**No new schema required.** Intents JSONB array from migration 068 handles:
- Base intents: `["request"]`, `["response"]`, `["thinking"]`
- With modifiers: `["request", "not_handled"]`, `["response", "handled_incorrectly"]`

---

## Intent Examples by Conversation Phase

### Planning Conversation

```
User:   [request] "Should we use GraphQL or REST?"
Agent:  [thinking] "Let me analyze the tradeoffs..."
User:   [response] "GraphQL seems better for this"
Agent:  [response] "Agreed, here's why..."
```

**Same intents, different mode context.**

### Executing Conversation

```
User:   [request] "Build the API"
Agent:  [response] "Working on it..."
Agent:  [response, not_handled] "Build phase 1 done, still working on auth"
User:   [request, not_handled] "The auth integration is missing"
Agent:  [response] "Just deployed auth fix"
User:   [response, handled_incorrectly] "That fix doesn't work"
Agent:  [thinking] "Let me debug this..."
Agent:  [response] "Found the issue, redeploying..."
```

---

## Implementation Order

1. **Backend:**
   - Update MESSAGE_INTENTS: remove old intents, add request/response/thinking/not_handled/handled_incorrectly
   - Update POST /messages to accept intents array
   - Add PATCH /messages/{id} endpoint for intent editing
   - Validation: 1 base intent required, max 2 modifiers

2. **Frontend:**
   - Create ModeToggle component
   - Create IntentSelector component
   - Create IntentEditModal component
   - Update message header with edit button
   - Add keyboard shortcut handlers (P/E)
   - Add mode background color styling
   - Wire up API calls

3. **Testing:**
   - Planning mode: toggle P, send messages with intents
   - Executing mode: toggle E, send with modifiers
   - Edit intents: click button, change, save
   - Multi-intent: check display (request + not_handled, etc)

---

## Success Criteria

- ✅ Mode toggle works (P/E keyboard shortcuts)
- ✅ Background changes based on mode
- ✅ Intent selector shows correct defaults by sender type
- ✅ Can send with 1+ intents
- ✅ Can edit intents after sending
- ✅ Modifiers display alongside base intents
- ✅ Colors match spec
- ✅ API validation enforces 1 base intent
- ✅ Works in both modes (planning & executing)
- ✅ Mode is per-thread, resets on page reload (not persisted)

---

## Deferred (Future)

- Persist mode per thread (user preference)
- Auto-suggest intents based on message content
- Intent-based notifications/escalations
- Analytics: track request → not_handled → resolved workflow
- Bulk intent editing
- Intent history/audit trail
