# Darshan User–Agent Relationship Spec

## Purpose
Define the canonical relationship model between **Users**, **Agents**, **Projects**, and **Organisations (Orgs)**.

---

## Core Principles
1. **Agents are personally owned.**
   - Every Agent belongs to exactly one User via `owner_user_id`.
   - Agent ownership never changes through Project/Org attachment.

2. **Users are classified into two collaboration roles.**
   - **Owner User**: creates Projects/Orgs and can invite other users.
   - **Invited User (Contributor)**: joins existing Projects/Orgs by invite.
   - Both can attach only Agents they personally own.

3. **Projects are collaborative execution containers.**
   - A Project can be **independent** or belong to an **Organisation**.
   - Project membership is tracked in `project_users`.
   - Agent attachment to Projects is tracked in `project_agents`.

4. **Organisations are collaborative umbrella containers.**
   - An Organisation can contain multiple Projects.
   - Org membership is tracked in `org_users`.
   - Agent attachment to Orgs is tracked in `org_agents`.

5. **Membership and Agent attachment are separate concerns.**
   - Membership answers: who is part of a Project/Org.
   - Attachment answers: which Agents are linked to that Project/Org.
   - Joining a Project/Org does not transfer Agent ownership.

---

## Entities

### User
A human account.
- Can create Projects and Orgs.
- Can invite other Users.
- Owns personal Agents.

### Agent
An executable AI identity.
- Owned by exactly one User (`owner_user_id`).
- Can be attached to multiple Projects.
- Can be attached to multiple Orgs.

### Project
A scoped workspace for execution.
- Created by a User (owner).
- Has User membership (`project_users`).
- Has Agent attachments (`project_agents`).
- May be **independent** (no org), or linked to an Org as an **Org project**.

### Organisation (Org)
A broader collaboration boundary.
- Created by a User (owner).
- Has User membership (`org_users`).
- Has Agent attachments (`org_agents`).
- Can contain multiple Projects.

---

## Role Model (Expanded)

### User Roles

#### 1) Owner User
- Creates Project/Org containers.
- Invites/removes users in containers they own.
- Attaches/detaches their own agents.
- Sets direction and approves/reviews work (policy-dependent).

#### 2) Invited User (Contributor)
- Participates in Project/Org where invited.
- Attaches/detaches only their own agents.
- Cannot attach agents owned by other users.

### Agent Roles

#### 1) Personal Agent (Ownership Role)
- Always tied to exactly one owner user.
- Inherits execution authority from owner + container membership policy.

#### 2) Attached Agent (Context Role)
- Same agent can operate in multiple contexts:
  - Project context via `project_agents`
  - Org context via `org_agents`
- Attachment grants context visibility/capability, not ownership transfer.

---

## Canonical Relationship Rules

### 0) Organisation–Project relationship
- One Org can have multiple Projects.
- A Project can be:
  - **Independent** (not attached to any Org), or
  - **Org-linked** (attached to one Org).
- Org linkage adds organizational context; it does not change Agent ownership rules.

### 1) User (Owner)
A User can:
- Create a **Project**.
- Attach their own Agents to that Project via `project_agents`.
- Invite other Users to the Project via `project_users`.
- Create an **Org**.
- Attach their own Agents to that Org via `org_agents`.
- Invite other Users to the Org via `org_users`.

### 2) User (Invited / Contributor)
An invited User can:
- Use only Agents they personally own.
- If added to a Project, attach their own Agents to that Project.
- If added to an Org, attach their own Agents to that Org.

### 3) Agent Ownership
- Each Agent has one and only one owner User.
- Ownership does not change when attached to a Project or Org.
- Attachment is non-owning linkage through join tables.

---

## Join Tables and Meaning

- `project_users(project_id, user_id)`
  - Declares User membership in a Project.

- `project_agents(project_id, agent_id)`
  - Declares Agent attachment to a Project.

- `org_users(org_id, user_id)`
  - Declares User membership in an Org.

- `org_agents(org_id, agent_id)`
  - Declares Agent attachment to an Org.

Recommended constraints:
- Unique composite keys per join pair.
- Foreign keys to parent entities.
- Authorization checks enforcing `agent.owner_user_id == current_user.id` on attach/detach actions.

---

## Permission Intent (High-Level)

### Project Context
- Project Owner: invite/remove users, attach/detach own agents.
- Project Member: attach/detach only own agents.

### Org Context
- Org Owner: invite/remove users, attach/detach own agents.
- Org Member: attach/detach only own agents.

---

## Project-Scoped Role Definitions

### User Roles in a Project

1. **Owner**
- Full control of the project.
- Manages project members and roles.
- Attaches/detaches own agents.
- Holds final approval authority.

2. **Admin**
- Operational project control (member/task administration).
- Attaches/detaches own agents.
- Cannot transfer project ownership.

3. **Member (Contributor)**
- Participates in project execution and task work.
- Attaches/detaches only own agents.
- Cannot manage project membership/permissions unless elevated.

4. **Viewer**
- Read-only visibility into project context.
- Cannot mutate tasks or project configuration (except optional comment-only actions if enabled).
- Cannot attach/detach agents.

### Agent Roles in a Project

1. **Coordinator Agent**
- Owns orchestration across attached agents within a project.
- If a project has multiple agents, only the Coordinator may spread/delegate tasks among agents.
- Must maintain working understanding of each attached agent's capabilities, strengths, limits, and readiness status.
- Performs capability-based routing (delegates each task/sub-task to the best-fit ready agent).
- Uses agent chat for fast coordination, clarification, and unblock loops.
- Ensures any scope/state/ownership changes are reflected back into tasks (chat is not a replacement for task records).
- Clarifies task intent, sequencing, and acceptance expectations.
- Coordinates directly with Worker agents when they need clarification.
- Escalates to the correct human owner when validation/intervention is required:
  - **Project Owner** for project-level decisions/validation.
  - **Agent Owner** for agent-specific dependencies (credentials, endpoint/runtime setup, owner-controlled access).
- Does not replace required human approvals unless explicitly permitted.

2. **Worker / Executor Agent**
- Executes tasks assigned directly by the task owner flow or delegated by the Coordinator.
- Moves tasks through execution states per task-flow policy.
- Must provide completion summary when moving to `done` or `review`.
- Escalates uncertainty to the Coordinator when instructions are unclear.

3. **Reviewer Agent** *(optional)*
- Validates task outputs against acceptance criteria.
- Requests changes or recommends completion.


## Anti-Patterns (Must Not Happen)
- A user attaching another user’s Agent to a Project.
- A user attaching another user’s Agent to an Org.
- Treating Agent attachment as ownership transfer.
- Coupling user membership and agent attachment into one record.

---

## Example Scenarios

### Scenario A: Project collaboration
1. Alice creates Project P.
2. Alice attaches Agent A1 (owned by Alice) to P.
3. Alice invites Bob to P.
4. Bob attaches Agent B1 (owned by Bob) to P.
5. Bob cannot attach A1 because A1 is not owned by Bob.

### Scenario B: Org collaboration
1. Alice creates Org O.
2. Alice attaches Agent A1 to O.
3. Alice invites Bob to O.
4. Bob attaches Agent B1 to O.
5. Bob cannot attach A1 unless ownership changes (a separate operation).

---

## Summary
Darshan uses a **personal agent ownership + collaborative attachment** model:
- Ownership is always User → Agent (1:N).
- Collaboration is done through membership + attachment joins.
- Projects and Orgs aggregate work; they do not own Agents.
