# Darshan Hub — Click Behavior Spec (Memory)

This memory entry mirrors the project click spec for the Darshan git clone at /home/ubuntu/.openclaw/workspace/projects/darshan. It documents the intended click flow and memory provenance.

## 1) Dashboard / /dashboard
- Shows all projects; acts as project directory.
- Click a project card navigates to /projects/:id.

## 2) Project Detail /projects/:id
- Tabs: Architecture, Technical Specification, Sprint Board, Team.
- 2.1 Architecture: read-only architecture docs for the project (GET /api/v1/projects/:id/architecture).
- 2.2 Technical Specification: read-only tech spec (GET /api/v1/projects/:id/tech-spec).
- 2.3 Sprint Board: project kanban with columns Proposed, Approved, In Progress, Done (GET /api/v1/projects/:id/tasks).
- 2.4 Team: per-project Team roster with agents and actions; Add Agent via an inline Agent Registry (GET /api/v1/agents, POST /api/v1/projects/:id/team).

## 3) Routing & UX
- Global Agent Registry is not exposed; team management happens in the Team tab.
- Memory persists for provenance and to aid recovery if session restarts.

## 4) Memory provenance
- Source: /home/ubuntu/.openclaw/workspace/projects/darshan
- Created memory entry on request and mirrored for memory bundle.
