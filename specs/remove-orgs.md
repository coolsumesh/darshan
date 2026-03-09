# Remove Organisations Spec
**Status:** Draft  
**Author:** Sanjaya  
**Date:** 2026-03-09

---

## 1. Decision

The concept of Organisations is removed. Projects become the sole top-level grouping entity. Users own projects. Other users and agents are invited directly into projects.

---

## 2. Current Model (being removed)

```
User
 └── creates → Organisation
                 ├── has members (org_users)
                 ├── has agents (org_agents / org_agent_contributions)
                 ├── owns Projects  ←  projects.org_id
                 └── generates Agent invite links (org_invites)
```

Users accessed projects through org membership. Agents were contributed to orgs and inherited project access from there.

---

## 3. New Model

```
User
 └── creates → Project
                 ├── invites Users directly  (project_users)
                 └── assigns Agents directly (project_agents)
```

No intermediate layer. Projects are standalone. Access is always per-project.

---

## 4. What Gets Removed

### DB Tables (drop)
| Table | Reason |
|---|---|
| `organisations` | Core entity being removed |
| `org_users` | Org membership — no longer needed |
| `org_agents` | Org agent contributions — no longer needed |
| `org_user_invites` | Org user invite links — replaced by project invites |

### DB Columns (drop)
| Table | Column | Reason |
|---|---|---|
| `projects` | `org_id` | Projects no longer belong to orgs |
| `agent_invites` | `org_id` | Invites become project-scoped |

### API Endpoints (remove — all in `agents.ts`)
| Method | Endpoint |
|---|---|
| `GET` | `/api/v1/orgs` |
| `POST` | `/api/v1/orgs` |
| `GET` | `/api/v1/orgs/:id` |
| `PATCH` | `/api/v1/orgs/:id` |
| `DELETE` | `/api/v1/orgs/:id` |
| `GET` | `/api/v1/orgs/:id/projects` |
| `GET` | `/api/v1/orgs/:id/agents` |
| `POST` | `/api/v1/orgs/:id/agent-contributions` |
| `DELETE` | `/api/v1/orgs/:id/agent-contributions/:agentId` |
| `POST` | `/api/v1/orgs/:id/logo` |
| `DELETE` | `/api/v1/orgs/:id/logo` |
| `GET` | `/api/v1/orgs/:id/members` |
| `POST` | `/api/v1/orgs/:id/members` |
| `DELETE` | `/api/v1/orgs/:id/members/:agentId` |
| `GET` | `/api/v1/orgs/:id/users` |
| `POST` | `/api/v1/orgs/:id/users` |
| `DELETE` | `/api/v1/orgs/:id/users/:userId` |
| `GET` | `/api/v1/orgs/:id/user-invites` |
| `POST` | `/api/v1/orgs/:id/user-invites` |
| `DELETE` | `/api/v1/orgs/:id/user-invites/:inviteId` |
| `POST` | `/api/v1/orgs/:id/invites` (agent onboarding invite) |

### Frontend Pages (remove)
| Path | Description |
|---|---|
| `/organisations` | Org list page |
| `/organisations/[id]` | Org detail page |

### Frontend Nav (remove)
```
{ href: "/organisations", label: "Organisations", icon: Building2 }
```

### Frontend Logic (update)
- `app-shell.tsx` — remove org invite handling (`invite_type === "org"`)
- `api.ts` — remove org API functions (`fetchOrgs`, `createOrg`, `acceptOrgInvite`, etc.)

---

## 5. What Changes

### 5.1 Project Ownership

Projects are now owned directly by a user. `projects.owner_user_id` already exists and is unchanged. `projects.org_id` is dropped.

**Before:** User → Org → Project  
**After:** User → Project

### 5.2 Project Access Control

`checkAccess()` in `projects.ts` currently has three paths:
1. Project owner (via `owner_user_id`)
2. Direct project invite (via `project_users`)
3. Org membership (via `org_users` where `org_id = project.org_id`)

Path 3 is removed. Access is now only through 1 (ownership) or 2 (direct invite).

### 5.3 Agent Invites

Currently agents are onboarded via an org-scoped invite link:
```
POST /api/v1/orgs/:id/invites
→ invite_url: /invite/<token>
→ agent follows link → joins org
```

Without orgs, invites become **project-scoped**:
```
POST /api/v1/projects/:id/agent-invites
→ invite_url: /invite/<token>
→ agent follows link → joins project directly
```

The `agent_invites` table gets `project_id` instead of `org_id`.

### 5.4 Agent Registry

Currently `GET /api/v1/orgs/:id/agents` lists all agents in an org.  
Replaced by the existing `GET /api/v1/projects/:id/agents` (already built).

Agents are assigned per-project via `project_agents`. No change needed here.

---

## 6. What Stays Unchanged

| | Status |
|---|---|
| `project_users` — direct user invites to projects | ✅ unchanged |
| `project_agents` — direct agent assignment to projects | ✅ unchanged |
| `GET/POST /api/v1/projects/:id/team` | ✅ unchanged |
| `GET/POST /api/v1/projects/:id/user-members` | ✅ unchanged |
| `GET/POST /api/v1/projects/:id/invites` (user invites) | ✅ unchanged |
| Agent callback token, heartbeat, inbox, tasks | ✅ unchanged |

---

## 7. Migration Strategy

### Phase 1 — Drop org DB objects
```sql
-- Remove org_id from projects (nullify first, then drop)
ALTER TABLE projects DROP COLUMN IF EXISTS org_id;

-- Remove org_id from agent_invites, add project_id
ALTER TABLE agent_invites DROP COLUMN IF EXISTS org_id;
ALTER TABLE agent_invites ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

-- Drop org tables
DROP TABLE IF EXISTS org_user_invites  CASCADE;
DROP TABLE IF EXISTS org_users         CASCADE;
DROP TABLE IF EXISTS org_agents        CASCADE;
DROP TABLE IF EXISTS organisations     CASCADE;
```

### Phase 2 — Update API
- Remove all `/api/v1/orgs/*` endpoints from `agents.ts`
- Add `POST /api/v1/projects/:id/agent-invites` to `projects.ts`
- Update `GET /api/v1/invites/:token` to handle project-scoped agent invites
- Update `checkAccess()` to remove org membership path

### Phase 3 — Update Frontend
- Remove `/organisations` nav item and pages
- Remove org invite handling from `app-shell.tsx`
- Remove org functions from `api.ts`
- Update invite UI to only show project invites

---

## 8. Open Questions

### Q1 — Existing org data
Some projects may currently have `org_id` set. When we drop the column, those projects become standalone owned by their `owner_user_id`. Is that correct, or do we need to do anything with org members before dropping?

*My lean: yes — drop the column. `owner_user_id` is already set on every project. Org members who need project access should be re-invited directly. Existing data is minimal enough to not warrant a complex migration.*

### Q2 — Agent invite scope
Currently agent onboarding invite links are org-scoped. After this change, they become project-scoped. An agent invited via a project link joins that project's `project_agents`.

Should an agent invite be able to target **multiple projects** at once, or strictly one project?

*My lean: one project per invite — keeps it simple and explicit.*

### Q3 — Agent invite in `agents.ts` vs `projects.ts`
The new `POST /api/v1/projects/:id/agent-invites` endpoint — should it live in `agents.ts` (alongside existing agent invite logic) or `projects.ts` (since it's project-scoped)?

*My lean: `projects.ts` — it's a project action, not an agent action.*

### Q4 — `Building2` icon and "Organisations" label
The sidebar currently has `{ href: "/organisations", label: "Organisations", icon: Building2 }`. Simply removed. Confirm?

---

## 9. Summary

| | Before | After |
|---|---|---|
| Top-level entity | Organisation | Project |
| User accesses project via | Org membership OR direct invite | Direct invite only |
| Agent joins via | Org invite link | Project invite link |
| DB tables | `organisations`, `org_users`, `org_agents`, `org_user_invites` | All dropped |
| API endpoints | 21 `/api/v1/orgs/*` endpoints | All removed |
| Frontend | `/organisations` nav + pages | Removed |
| Complexity | User → Org → Project → Agents | User → Project → Agents |
