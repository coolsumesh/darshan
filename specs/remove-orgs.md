# Remove Organisations → Introduce Workspaces
**Status:** Final  
**Author:** Sanjaya  
**Date:** 2026-03-09

---

## 1. Decision

Organisations are removed. A lightweight **Workspace** concept replaces them — an optional grouping of related projects. Projects can exist standalone without a workspace. Workspaces carry no members, no roles, no agent management, and no invite system. They are purely organisational containers.

---

## 2. Model Comparison

**Before:**
```
User
 └── Organisation  (members, roles, agents, invites, logo)
       └── Projects
```

**After:**
```
User
 ├── Workspace (optional label/folder for projects)
 │     └── Projects
 └── Projects (standalone — no workspace required)
```

**Key difference:** Workspace is just a named container. All access control, agent assignment, and invites remain at the project level.

---

## 3. Workspace — What It Is

| Property | Value |
|---|---|
| Purpose | Group related projects together |
| Required? | No — projects are standalone by default |
| Has members? | No |
| Has roles? | No |
| Has agents? | No |
| Has invites? | No |
| Owned by | The user who created it |
| Project access | Unchanged — managed per project |

A workspace is just a name and a list of projects. Nothing more.

---

## 4. DB Changes

### 4.1 Drop org tables
```sql
DROP TABLE IF EXISTS org_user_invites  CASCADE;
DROP TABLE IF EXISTS org_users         CASCADE;
DROP TABLE IF EXISTS org_agents        CASCADE;
DROP TABLE IF EXISTS organisations     CASCADE;
```

### 4.2 Create `workspaces` table
```sql
CREATE TABLE workspaces (
  workspace_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text,
  created_by   uuid        NOT NULL,  -- user UUID
  created_slug text        NOT NULL,  -- snapshot for readability
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

| Column | Description |
|---|---|
| `workspace_id` | Unique identifier |
| `name` | e.g. "MithranLabs Internal", "Client Work" |
| `description` | Optional longer description |
| `created_by` | User who created it — only they can rename or delete |
| `created_slug` | Slug snapshot for raw readability |
| `created_at` | When it was created |

### 4.3 Update `projects` table
```sql
-- Remove org reference, add workspace reference (nullable)
ALTER TABLE projects DROP COLUMN IF EXISTS org_id;
ALTER TABLE projects ADD COLUMN workspace_id uuid
  REFERENCES workspaces(workspace_id) ON DELETE SET NULL;
```

`workspace_id` is **nullable** — projects that don't belong to a workspace are perfectly valid.

### 4.4 Update `agent_invites` table
```sql
-- Invites are now platform-level (no org, no project scope)
ALTER TABLE agent_invites DROP COLUMN IF EXISTS org_id;
```

Agent invites no longer reference an org. An invited agent registers on the platform and is then assigned to projects manually by the project owner.

---

## 5. API Changes

### 5.1 Remove — all org endpoints (21 total)

All `/api/v1/orgs/*` endpoints are removed:

| Removed |
|---|
| `GET/POST /api/v1/orgs` |
| `GET/PATCH/DELETE /api/v1/orgs/:id` |
| `GET /api/v1/orgs/:id/projects` |
| `GET /api/v1/orgs/:id/agents` |
| `POST/DELETE /api/v1/orgs/:id/agent-contributions` |
| `POST/DELETE /api/v1/orgs/:id/logo` |
| `GET/POST/DELETE /api/v1/orgs/:id/members` |
| `GET/POST/DELETE /api/v1/orgs/:id/users` |
| `GET/POST/DELETE /api/v1/orgs/:id/user-invites` |
| `POST /api/v1/orgs/:id/invites` (agent onboarding) |

### 5.2 Add — workspace endpoints

Simple CRUD. No members, roles, or agent management.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/workspaces` | Create a workspace |
| `GET` | `/api/v1/workspaces` | List workspaces owned by caller |
| `GET` | `/api/v1/workspaces/:id` | Get workspace + its projects |
| `PATCH` | `/api/v1/workspaces/:id` | Rename or update description |
| `DELETE` | `/api/v1/workspaces/:id` | Delete workspace — projects become standalone |

### 5.3 Update — project endpoints

| Endpoint | Change |
|---|---|
| `POST /api/v1/projects` | Accept optional `workspace_id` in body |
| `PATCH /api/v1/projects/:id` | Accept `workspace_id` to move project in/out of workspace |
| `GET /api/v1/projects` | Return `workspace_id` and `workspace_name` per project |

### 5.4 Update — agent invite endpoints

Remove org scope. Invites become platform-level:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/agent-invites` | Generate a platform invite link |
| `GET` | `/api/v1/agent-invites` | List your invite links |
| `DELETE` | `/api/v1/agent-invites/:id` | Cancel an invite |
| `GET` | `/api/v1/invites/:token` | Agent follows link (already exists, update to handle no org) |

### 5.5 Update — access control

Remove org membership path from `checkAccess()` in `projects.ts`:

```
Before:
  1. Project owner
  2. Direct project invite (project_users)
  3. Org membership (org_users where org_id = project.org_id)  ← remove

After:
  1. Project owner
  2. Direct project invite (project_users)
```

Workspace membership grants no access to projects. Access is always per-project.

---

## 6. Frontend Changes

### 6.1 Remove
- `/organisations` page
- `/organisations/[id]` page
- Org invite handling in `app-shell.tsx`
- Org functions in `api.ts`

### 6.2 Add
- `/workspaces` page — list of workspaces with project counts
- `/workspaces/[id]` page — workspace detail, shows grouped projects
- Workspace selector when creating a project (optional dropdown)
- Sidebar nav item: `{ href: "/workspaces", label: "Workspaces", icon: Folders }`

### 6.3 Update
- `app-shell.tsx` — replace `Organisations` nav with `Workspaces`
- `api.ts` — replace org functions with workspace functions
- Project cards/list — optionally show workspace badge

---

## 7. Invite Flow (updated)

**Before:**
```
User creates Org → generates org-scoped invite
Agent follows invite → registered → joins Org → inherits Org projects
```

**After:**
```
User generates platform invite (no scope)
Agent follows invite → registered on platform
User manually assigns agent to projects via project team page
```

Registration and project assignment are explicit, separate steps. One invite, any number of project assignments after.

---

## 8. What Stays Unchanged

| | Status |
|---|---|
| `project_users` — direct user invites to projects | ✅ unchanged |
| `project_agents` — direct agent assignment to projects | ✅ unchanged |
| `GET/POST /api/v1/projects/:id/team` | ✅ unchanged |
| `GET/POST /api/v1/projects/:id/user-members` | ✅ unchanged |
| `GET/POST /api/v1/projects/:id/invites` (user invites) | ✅ unchanged |
| Agent heartbeat, inbox, tasks, levels | ✅ unchanged |
| Thread / notification system | ✅ unchanged |

---

## 9. Migration Strategy

### Phase 1 — DB (migration 049)
1. Drop `org_user_invites`, `org_users`, `org_agents`, `organisations`
2. Create `workspaces` table
3. Drop `projects.org_id`, add `projects.workspace_id` (nullable)
4. Drop `agent_invites.org_id`

### Phase 2 — API
1. Remove all `/orgs/*` endpoints from `agents.ts`
2. Add workspace CRUD to a new `workspaces.ts` route file
3. Update `projects.ts` — add `workspace_id` support, remove `checkAccess` org path
4. Update agent invite endpoints — remove org scope

### Phase 3 — Frontend
1. Remove org pages and nav
2. Add workspace pages and nav
3. Update project create/edit form with optional workspace selector
4. Clean up `api.ts` and `app-shell.tsx`

---

## 10. Summary

| | Organisations (removed) | Workspaces (new) |
|---|---|---|
| Purpose | Group users, agents, projects with roles | Group related projects only |
| Members | Yes — with roles | No |
| Agents | Yes — contributed, inherited | No |
| Invites | Yes — org-scoped | No |
| Access control | Yes — org membership → project access | No — projects manage own access |
| Required? | Projects had to belong to an org | Completely optional |
| DB tables | 4 tables, complex joins | 1 table |
| API endpoints | 21 endpoints | 5 endpoints |
| Complexity | High | Minimal |
