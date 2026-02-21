# Komal Spec — Projects Page UX
**Author:** Komal 🌸  
**Date:** 2026-02-21  
**Scope:** `/projects` (listing) + `/projects/[id]` (detail)  
**Status:** Ready for review

---

## 1. Projects Listing Page (`/projects`)

### Current state
- Card grid with search bar
- "New Project" button with no action
- No filtering or sorting
- Card shows: name, slug, description, progress bar, team size, status

---

### Proposed Changes

#### 1.1 — Stat summary bar
Add 3 stat cards above the grid (like the Agents registry):

| Stat | Value |
|---|---|
| Total Projects | count |
| Active | count where status=active |
| Avg Progress | mean of all progress% |

Quick-scan wins for a manager view. Low implementation effort.

---

#### 1.2 — Status filter tabs
Replace no-filter with tab bar: **All · Active · Planned · Review**

```
[ All (4) ]  [ Active (2) ]  [ Planned (1) ]  [ Review (1) ]
```

Each tab filters the card grid. "All" is default.

---

#### 1.3 — Sort control
Add a simple sort dropdown next to search: **Name · Progress · Team size · Status**

Default: sort by status (active first).

---

#### 1.4 — View toggle (Grid / List)
Add grid/list toggle (same pattern as Agents page).

**List view columns:** Name · Status · Progress bar · Team · Last updated · Actions

Useful when there are many projects — faster to scan than cards.

---

#### 1.5 — Project card improvements

**Add to each card:**
- Task count badge: `12 tasks · 3 open` (from `/api/v1/projects/:id/tasks`)
- Assignee avatars row (up to 4, then +N overflow)
- Last activity timestamp

**Remove:** The redundant `TrendingUp` + status label in footer (status is already a pill in header)

---

#### 1.6 — "New Project" creation modal
The button currently has no action. Add a modal:

```
┌─────────────────────────────┐
│ New Project                  │
│ Name *          [__________] │
│ Slug            [__________] │
│ Description     [__________] │
│ Status  ○ Active ○ Planned   │
│              [Cancel] [Create]│
└─────────────────────────────┘
```

On save: `POST /api/v1/projects` → redirect to `/projects/:id`.

---

#### 1.7 — Empty state
Current: "No projects found." plain text  
Proposed: Illustrated empty state with CTA button

---

## 2. Project Detail Page (`/projects/[id]`)

### Current state (post mobile-responsive update)
- Task List tab: table with sections by status, collapsible
- Team tab: list with ping + remove
- Architecture / Tech Spec: markdown render
- Task Detail Panel: 400px sidebar / full-screen mobile overlay

---

### Proposed Changes

#### 2.1 — Project header stat row
Add a thin stats bar between header and tabs:

```
● 12 tasks   ✓ 3 done   ⧖ 2 in review   👥 4 members   📅 Due: Mar 15
```

Gives at-a-glance project health without opening anything.

---

#### 2.2 — Bulk task actions
Checkboxes already exist but do nothing. Wire them up:

- Checking ≥1 task → show floating action bar at bottom:
  ```
  [ 3 selected ]  [Change status ▾]  [Reassign ▾]  [Delete]  [✕]
  ```
- Bulk status change: PATCH all selected task IDs
- Bulk delete: DELETE all selected task IDs

---

#### 2.3 — Due date picker in Task Detail Panel
Currently: due date shown as read-only pill  
Proposed: click the date → native `<input type="date">` → auto-save on change

---

#### 2.4 — Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | Open "New task" modal |
| `Esc` | Close task detail panel |
| `/` | Focus search (if search is wired up) |

Add a small `?` icon in toolbar that shows a shortcuts cheat sheet.

---

#### 2.5 — Story Points column total in section header
Currently: SP total shows on the right of the section header collapse button.  
Proposed: Show also `X tasks · Y SP · Z done%` in the header for at-a-glance status per section.

---

#### 2.6 — Task row: click anywhere to open
Currently: only the `ExternalLink` icon opens the detail panel.  
Proposed: clicking anywhere on the row (except inline editing fields) opens the panel.

Rationale: on mobile the card layout already does this — desktop should match.

---

#### 2.7 — "New task" quick-add inline
Below each section, after existing tasks, add an inline input row:

```
[+] Type a task name…
```

Enter key → creates task in that section's status without opening the modal. Reduces friction for power users.

---

## 3. Implementation Priority

| # | Change | Effort | Impact |
|---|---|---|---|
| 1 | Task row click-to-open (2.6) | XS | High |
| 2 | Status filter tabs (1.2) | S | High |
| 3 | New Project modal (1.6) | S | High |
| 4 | Due date picker (2.3) | S | Medium |
| 5 | Stat summary bar (1.1 + 2.1) | S | Medium |
| 6 | Bulk task actions (2.2) | M | High |
| 7 | Project card improvements (1.5) | M | Medium |
| 8 | View toggle list/grid (1.4) | M | Low |
| 9 | Sort control (1.3) | XS | Low |
| 10 | Keyboard shortcuts (2.4) | S | Low |
| 11 | Inline quick-add (2.7) | M | Medium |

---

## 4. Out of Scope (this spec)

- Epics / sub-tasks (covered in separate Phase 3 spec)
- Comments / activity feed (Phase 3)
- Kanban view (removed from current build)
- Real-time collaboration cursors
