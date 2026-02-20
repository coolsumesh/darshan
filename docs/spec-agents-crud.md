# Spec: Agent Registry CRUD Operations
**Author:** Komal 🌸  
**Date:** 2026-02-20  
**Page:** `/agents`  
**Status:** Ready to implement

---

## Goal

Make the Agent Registry fully functional for managing agents and organisations — create, read, update, delete — without leaving the page.

---

## Current State

| Operation | Agent | Org |
|---|---|---|
| Create | ✅ "Onboard Agent" modal | ✅ "Onboard Org" modal |
| Read | ✅ Cards / list + detail panel | ✅ Org sections |
| Update | ❌ No edit | ❌ No edit |
| Delete | ✅ Trash icon in detail panel | ❌ No delete |

---

## Changes Required

### 1. Backend — `PATCH /api/v1/agents/:id`
Accept partial updates: `name`, `desc`, `agent_type`, `model`, `provider`, `capabilities`, `endpoint_type`.  
Returns `{ ok: true, agent: {...} }`.  
**Status:** ✅ Already added in `apps/api/src/routes/agents.ts`

### 2. API Client — `updateAgent()`
Calls `PATCH /api/v1/agents/:id`.  
**Status:** ✅ Already added in `apps/web/src/lib/api.ts`

### 3. Agent Detail Panel — Edit Mode

**Trigger:** Pencil (✏️) icon in panel header  
**Behaviour:**
- Header gains "Editing" label; pencil becomes X (cancel)
- Fields become editable inputs (inline, not a modal):
  - Name → text input
  - Description → textarea
  - Agent type → select (`ai_agent` | `ai_coordinator` | `human` | `system`)
  - Provider → select
  - Model → select + free-text
  - Capabilities → pill toggle (existing UI pattern)
- "Save changes" button appears at bottom of panel
- On save: calls `updateAgent()`, reloads, exits edit mode
- On cancel: discards changes, returns to view mode

### 4. Org Section Header — Edit Org

**Trigger:** ✏️ icon on the right of org section header (always visible, not hover-only)  
**Behaviour:** Opens `EditOrgModal` with current values pre-filled:
- Org name
- Slug (read-only once created — show greyed out)
- Description
- Type (own / partner / client / vendor)
- On save: calls `updateOrg()`, reloads

### 5. Org Section Header — Delete Org

**Trigger:** 🗑️ icon on the right of org section header  
**Constraint:** Backend returns 409 if org has agents. So:
- If org has agents → show inline warning: "Remove all agents first"
- If org is empty → show confirm popover → calls `deleteOrg()`, reloads

### 6. Agent type display labels (bonus — 5 min fix)
| Raw value | Display |
|---|---|
| `ai_agent` | AI Agent |
| `ai_coordinator` | Coordinator |
| `human` | Human |
| `system` | System |

---

## Files to Change

| File | Change |
|---|---|
| `apps/api/src/routes/agents.ts` | ✅ Done — `PATCH /api/v1/agents/:id` |
| `apps/web/src/lib/api.ts` | ✅ Done — `updateAgent()` |
| `apps/web/src/app/(proto)/agents/page.tsx` | Agent edit mode in detail panel + Org edit/delete in section header + label formatting |

---

## Out of Scope (this PR)

- Reassigning an agent to a different org
- Bulk operations (multi-select delete)
- Org member role management (PATCH org_members)
