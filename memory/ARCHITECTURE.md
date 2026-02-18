# Darshan Architecture (Memory) - Updated

This memory artifact captures the high-level architecture for the Darshan project clone at:
- Path: /home/ubuntu/.openclaw/workspace/projects/darshan

Updated flow (aligned with latest click spec):
- Dashboard ( /dashboard ) acts as the project directory, listing all active projects.
- Project pages (/projects/:id) contain four tabs:
  - Architecture (read-only architecture diagrams and design)
  - Technical Specification (read-only stack/infra/API contracts)
  - Sprint Board (kanban with Proposed, Approved, In Progress, Done)
  - Team (per-project agent roster with per-project Add Agent action via inline registry)
- Global Agent Registry is not exposed as a top-level nav; agents are managed in the Team tab per project.

Provenance
- This document is stored in memory under /home/ubuntu/.openclaw/workspace/projects/darshan/memory.
- Original live artifact path: (live live live) if needed in future.

Notes
- This is a memory artifact intended for recovery and context; refer to the live repository for active development.