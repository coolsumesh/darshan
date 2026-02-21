# Mobile Responsive Plan — Darshan Projects Page
> File: `apps/web/src/app/(proto)/projects/[id]/page.tsx`
> Target breakpoints: `sm` = 640px, `md` = 768px (Tailwind defaults)

---

## Problem Summary

The projects page is built for desktop with fixed-width columns. On mobile:
- The task table overflows horizontally (columns like `w-28`, `w-36`, `w-32` etc. add up to ~400px+ just for metadata)
- The Task Detail Panel is hardcoded `width: 400px` — takes the full screen and covers the list
- The Team tab has 6+ fixed columns that don't wrap
- The tab bar overflows on narrow screens
- The toolbar row has too many buttons for small widths

---

## Changes by Component

---

### 1. `ProjectHeader`

**Problem:** Fixed height `h-[72px]`, description truncated but still cramped on very small screens. Fine on most phones but description can be cut off.

**Fix:**
- Remove fixed `h-[72px]` → use `min-h-[56px] py-2 sm:h-[72px]`
- Hide description on `xs` screens: `hidden sm:block`
- Reduce avatar size on mobile: `h-8 w-8 sm:h-10 sm:w-10`
- Shrink action buttons: condense to just `MoreHorizontal` on mobile

---

### 2. Tab Bar

**Problem:** 4 tabs with text labels don't fit on 360px screens. They clip or wrap messily.

**Fix:**
- Make the tab bar `overflow-x-auto` with `scrollbar-hide`
- On mobile (`sm:` breakpoint), hide tab label text, show icon only
- Use `whitespace-nowrap` on each tab button
- Example:
  ```tsx
  <span className="hidden sm:inline">{tab.label}</span>
  ```

---

### 3. Toolbar

**Problem:** Shows 5+ buttons with text labels. Too wide for mobile.

**Fix:**
- Hide text labels on mobile: `hidden sm:inline`
- Compress the separator
- Stack "New task" button to icon-only on mobile (`sm:` shows text):
  ```tsx
  <span className="hidden sm:inline ml-1.5">New task</span>
  ```

---

### 4. `TableRow` (Task List rows)

**Problem:** Each row has 9 columns totalling ~600px+ minimum width. Overflows badly on mobile.

**Fix — Two-tier display:**

**Mobile (`< md`):** Show a card-style row:
- Line 1: Task title (full width)
- Line 2: Status pill + Priority pill + Assignee avatar (flex row, wraps if needed)
- Hide: Task ID, SP, Type, Due date (show in detail panel instead)
- Tap row → open Task Detail Panel (full screen on mobile)

**Desktop (`md+`):** Keep existing full-width table layout.

Implementation: wrap entire row content in responsive flex:
```tsx
{/* Mobile layout */}
<div className="flex flex-col gap-1 py-2 px-3 md:hidden">
  <span className="text-sm font-medium text-zinc-900 truncate">{task.title}</span>
  <div className="flex items-center gap-2 flex-wrap">
    <StatusPill status={task.status} />
    <PriorityPill priority={task.priority} />
    {task.assignee && <AvatarChip name={task.assignee} />}
  </div>
</div>

{/* Desktop layout — existing */}
<div className="hidden md:flex items-center ...existing...">
  ...
</div>
```

---

### 5. Column Headers (`COL_HEADERS` row in `TableSection`)

**Problem:** The header row mirrors the desktop column layout — invisible/wrong on mobile.

**Fix:**
- Wrap in `hidden md:flex`

---

### 6. `TaskDetailPanel`

**Problem:** Hardcoded `width: 400, minWidth: 400`. On mobile this covers the entire screen and the layout is `flex` side-by-side, so the task list gets squeezed to 0 width.

**Fix — Bottom sheet / Full screen on mobile:**

Option A (simpler): On mobile, render the panel as a fixed full-screen overlay:
```tsx
<div
  className={cn(
    "flex flex-col bg-white dark:bg-[#16132A]",
    // Mobile: full screen overlay
    "fixed inset-0 z-40 md:relative md:inset-auto",
    // Desktop: fixed 400px sidebar
    "md:border-l md:border-zinc-200 md:dark:border-[#2D2A45]"
  )}
  style={{ width: undefined }} // remove hardcoded width on mobile
>
```

On mobile, add a back arrow instead of X to close (or keep X but make it clear it goes back to list).

The parent `TaskBoardContent` flex layout should also adjust:
```tsx
{/* Main content — hide on mobile when panel is open */}
<div className={cn(
  "flex min-w-0 flex-1 flex-col overflow-y-auto",
  detailTask ? "hidden md:flex" : "flex"
)}>
```

---

### 7. `TeamMemberRow`

**Problem:** 6 fixed-width columns (`w-28 w-20 w-32 w-28 w-24 w-20`). Completely overflows mobile.

**Fix — Responsive column hiding:**
- **Always show:** Name, Role
- **Hide on mobile:** Type, Model, Org, Ping, Actions (show actions on long-press or swipe)
- **Mobile row:**
  ```tsx
  {/* Mobile: name + role only */}
  <div className="flex items-center gap-3 md:hidden ...">
    <Avatar /><Name /><RolePill /><RemoveButton />
  </div>
  {/* Desktop: full row */}
  <div className="hidden md:flex items-center gap-3 ...">
    ...existing...
  </div>
  ```

---

### 8. Team Tab Column Headers

**Problem:** Same as task table — fixed-width header row.

**Fix:**
- Wrap in `hidden md:flex`

---

### 9. `CreateTaskModal`

**Problem:** The 2-column `grid-cols-2` for form fields gets too tight on small phones. The modal is `max-w-md` which is fine but internally the grid can pinch.

**Fix:**
- Change `grid grid-cols-2` → `grid grid-cols-1 sm:grid-cols-2`
- Ensure modal padding is comfortable on mobile: `p-4 sm:p-5`

---

### 10. `AgentRegistryPanel`

**Problem:** Positioned `items-end justify-end` (slides in from bottom-right corner). `w-80` may overflow on small screens.

**Fix:**
- On mobile, make it full-width bottom sheet: 
  ```tsx
  className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:items-end sm:justify-end sm:p-4"
  ```
- Inner panel: `w-full sm:w-80`
- Add rounded-t corners on mobile, rounded-2xl on desktop

---

## Breakpoint Summary

| Component            | Mobile (< 768px)              | Desktop (≥ 768px)         |
|----------------------|-------------------------------|---------------------------|
| ProjectHeader        | Compact, no description        | Full with description      |
| Tab Bar              | Icons only, scrollable         | Icons + labels             |
| Toolbar              | Icon-only buttons              | Icons + labels             |
| Task rows            | Card-style (2 lines)           | Full table with columns    |
| Column headers       | Hidden                         | Visible                    |
| Task Detail Panel    | Full-screen overlay            | 400px right sidebar        |
| Task list            | Hidden when panel open         | Always visible             |
| Team rows            | Name + Role only               | All 6 columns              |
| Team column headers  | Hidden                         | Visible                    |
| Create Task modal    | 1-col form grid                | 2-col form grid            |
| Agent Registry       | Bottom sheet, full width       | Bottom-right popover w-80  |

---

## Implementation Order

1. **Task Detail Panel → Full screen on mobile** — biggest UX win, prevents layout breakage
2. **TableRow → Card layout on mobile** — most content-heavy fix
3. **Tab Bar → Icons only + scrollable** — quick win
4. **TeamMemberRow → Hide secondary columns on mobile**
5. **Column headers → `hidden md:flex`**
6. **Toolbar → Icon-only on mobile**
7. **ProjectHeader → Compact on mobile**
8. **CreateTaskModal grid → `grid-cols-1 sm:grid-cols-2`**
9. **AgentRegistryPanel → Bottom sheet on mobile**

---

## Notes

- Use Tailwind `md:` prefix throughout (768px breakpoint) — matches the point where sidebar nav collapses
- No new dependencies needed — pure Tailwind + CSS
- Keep all existing desktop layout intact (all changes are mobile-first additions or `md:hidden`/`hidden md:flex` toggles)
- Portal-based popovers (StatusPopover, PriorityPopover, etc.) position via `getBoundingClientRect()` — they work fine on touch but may need `touchstart` event handling in addition to `mousedown` for click-outside on iOS (minor follow-up)
