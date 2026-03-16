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
- Same base intents available
- Modifiers only editable after send
- Signals: "We're discussing/planning/ideating"
- Use case: Spec discussions, design, approach decisions

**Example:**
```
PLANNING MODE
┌───────────────────────────────────────┐
│ [Type your message...]                │
│                                       │
│ [🎯 request] [📎] [Send]             │
│   ↑ Icon button, click for popup    │
│                                       │
│ Popup on click:                       │
│ ┌────────────────────┐               │
│ │ ◉ request         │               │
│ │ ○ response        │               │
│ │ ○ thinking        │               │
│ └────────────────────┘               │
│                                       │
│ [Shift+Tab to Execute]               │
└───────────────────────────────────────┘
```

### Executing Mode [E]

**Visual Cues:**
- Background: Normal (white)
- Header indicator: "EXECUTING MODE"
- Keyboard shortcut: `Shift + Tab` to toggle (default mode)

**Behavior:**
- Same base intents available
- Modifiers only editable after send
- Signals: "We're building/implementing/delivering"
- Use case: Building features, fixing bugs, delivery

**Example:**
```
EXECUTING MODE
┌───────────────────────────────────────┐
│ [Type your message...]                │
│                                       │
│ [🎯 request] [📎] [Send]             │
│   ↑ Icon button, click for popup    │
│                                       │
│ Popup on click:                       │
│ ┌────────────────────┐               │
│ │ ◉ request         │               │
│ │ ○ response        │               │
│ │ ○ thinking        │               │
│ └────────────────────┘               │
│                                       │
│ [Shift+Tab to Plan]                  │
└───────────────────────────────────────┘
```

---

## Compose Behavior

### Default Intent Assignment

**User (Sumesh):**
- Base intent defaults to `request`
- Can change via icon button popup

**Agent (Sanjaya):**
- Base intent defaults to `response`
- Can change via icon button popup

### Base Intent Selection (Persistent per Session)

- Icon button appears **above** attachment button in compose box
- Click → compact popup showing 3 radio buttons (request, response, thinking)
- Selection persists until changed again (session-wide, not per-message)
- Current selection displayed/indicated on button (optional: show emoji or abbreviation)

### Modifiers (Per-Message, Edit-Only)

- Modifiers are **NOT** available in compose
- Only editable **after sending** via [✎ edit] button on message header
- Full modal opens with ability to add/remove not_handled and/or handled_incorrectly

### Message Sending

Sends message with only the **base intent**:

```json
{
  "body": "Let me work through this approach",
  "intents": ["thinking"]
}
```

No modifiers in initial send. Add them later via edit if needed.

### Multi-Intent (Editing)

Example edits (after send):
```json
// Add not_handled modifier
{
  "intents": ["request", "not_handled"]
}

// Add both modifiers
{
  "intents": ["response", "not_handled", "handled_incorrectly"]
}

// Change base intent + modifiers
{
  "intents": ["thinking"]
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

Keyboard shortcut handled globally (Shift + Tab).

### 2. Base Intent Button (Compose)

**File:** `apps/web/src/components/BaseIntentButton.tsx`

Props:
```typescript
{
  baseIntent: "request" | "response" | "thinking"
  onBaseIntentChange: (intent: "request" | "response" | "thinking") => void
}
```

**Location:** Above attachment button in compose box

**Display:**
- Icon button (🎯 or similar emoji/icon)
- Optional: show current intent abbreviation or emoji on button
- Click → compact popup with 3 radio options (request, response, thinking)

**Popup Behavior:**
```
┌────────────────────┐
│ ◉ request         │
│ ○ response        │
│ ○ thinking        │
└────────────────────┘
```

- Selection persists until changed again
- Popup closes after selection
- Works in both Planning and Executing modes

### 3. Intent Edit Modal (Post-Send)

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

**Display:**
- Base Intent (radio buttons, read-only or editable):
  ```
  ◉ request
  ○ response
  ○ thinking
  ```
- Modifiers (checkboxes, editable):
  ```
  ☐ not_handled
  ☐ handled_incorrectly
  ```
- [Cancel] [Save] buttons

**Rules:**
- Exactly 1 base intent required
- 0, 1, or 2 modifiers optional

### 4. Message Header with Edit Button

**Update:** `apps/web/src/app/(proto)/threads/page.tsx`

Current:
```
SENDER  time ago  [intents]  message_id
```

Updated:
```
SENDER  time ago  [intents] [✎ edit]  message_id
```

Click [✎] → open IntentEditModal for that message

### 5. Compose Box with Mode Context

**Update:** `apps/web/src/app/(proto)/threads/page.tsx`

Add:
- Mode toggle (Shift+Tab keyboard shortcut)
- Background color based on mode (planning = blue-50, executing = white)
- Base Intent Button component (above attachment)
- Send button
- No modifiers in compose

---

## UI Layout (Detailed)

### Compose Box Flow

```
┌─────────────────────────────────────────────────────┐
│ PLANNING MODE [P indicator]                         │
│                                                     │
│ [Message input area]                                │
│ Type your message here...                           │
│                                                     │
│ [🎯] [📎] [Send]                                   │
│  ↑    ↑      ↑                                      │
│  |    |      Send button (always enabled)          │
│  |    Attachment button (existing)                 │
│  Base Intent Button                                │
│                                                     │
│ When you click [🎯]:                               │
│ ┌─────────────────────┐                            │
│ │ Select Base Intent: │                            │
│ │ ◉ request          │                            │
│ │ ○ response         │                            │
│ │ ○ thinking         │                            │
│ └─────────────────────┘                            │
│ (closes after selection)                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Sent Message & Edit Flow

```
┌─────────────────────────────────────────────────────┐
│ SUMESH  2m ago  [request] [✎ edit]  msg-id-1234   │
│                           ↑                        │
│                    Click to edit                   │
│ Here's my thought on this...                        │
│                                                     │
└─────────────────────────────────────────────────────┘

When you click [✎ edit]:

┌─────────────────────────────────────────┐
│ Edit Intent                             │
├─────────────────────────────────────────┤
│ Base Intent (pick one):                 │
│ ◉ request                               │
│ ○ response                              │
│ ○ thinking                              │
│                                         │
│ Modifiers (optional):                   │
│ ☐ not_handled                           │
│ ☐ handled_incorrectly                   │
│                                         │
│ [Cancel]  [Save]                        │
└─────────────────────────────────────────┘
```

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
   - ✅ intents JSONB array exists (migration 068)
   - ✅ POST /messages accepts intents array
   - PATCH /messages/{id} endpoint for intent editing (in progress)
   - Validation: 1 base intent required, max 2 modifiers

2. **Frontend:**
   - Create **BaseIntentButton** component (icon + compact popup)
   - Create **IntentEditModal** component (post-send editing)
   - Create **ModeToggle** component (planning/executing with Shift+Tab)
   - Update message header with [✎ edit] button
   - Add keyboard shortcut handlers (Shift+Tab)
   - Add mode background color styling (planning = blue-50, executing = white)
   - Wire up API calls (POST intents on send, PATCH on edit)

3. **Testing:**
   - Compose: click icon button, select intent, send
   - After send: click [✎], add modifiers, save
   - Planning mode: toggle with Shift+Tab, background changes
   - Executing mode: same flow, different background
   - Multi-intent: send request, edit to add not_handled
   - Verify colors match spec

---

## Success Criteria

- ✅ Mode toggle works (Shift+Tab keyboard shortcut)
- ✅ Background changes based on mode (planning = blue-50, executing = white)
- ✅ Base Intent Button above attachment, click opens popup
- ✅ Popup shows 3 radio buttons (request, response, thinking)
- ✅ Selection persists until changed
- ✅ Message sends with only base intent (no compose modifiers)
- ✅ After send: [✎ edit] button appears on message
- ✅ Click [✎] → IntentEditModal opens with base intent + modifier checkboxes
- ✅ Can add/remove not_handled and/or handled_incorrectly in edit modal
- ✅ Save calls PATCH /messages/{id} with updated intents
- ✅ Intents display as colored badges (request=blue, response=green, thinking=amber, not_handled=yellow, handled_incorrectly=red)
- ✅ Works in both modes (planning & executing)
- ✅ Mode is per-thread, resets on page reload (not persisted)
- ✅ API validation enforces 1 base intent, max 2 modifiers

---

## Base Intent Button Details

### Icon & Display

**Icon Options:**
- 🎯 (bullseye — specific intent/goal)
- 💬 (speech bubble — communication intent)
- 🏷️ (label — intent as a label)
- ✏️ (pencil — editable intent)

**Recommendation:** 🎯 (minimal, clear intent selection purpose)

**Button Style:**
- Compact icon button (no text label in normal state)
- Optional: show current intent as abbreviation (R/r/t) on button
- Positioned directly above attachment button
- Same styling/sizing as attachment button for consistency

**Keyboard Alternative (optional, future):**
- Cmd/Ctrl+Shift+I to open intent popup
- Or use number keys (1=request, 2=response, 3=thinking)

---

## Deferred (Future)

- Persist mode per thread (user preference)
- Persist base intent selection per user (defaults)
- Auto-suggest intents based on message content
- Intent-based notifications/escalations
- Analytics: track request → not_handled → resolved workflow
- Bulk intent editing
- Intent history/audit trail
- Keyboard shortcuts for intent selection (1/2/3 keys)
