-- 053_agent_levels_minimal.sql
-- Minimal model:
-- 1) project_level_definitions(project_id, level, name)
-- 2) agent_project_levels (keep)
-- 3) agent_level_events (keep)
-- Drop unused extras.

CREATE TABLE IF NOT EXISTS project_level_definitions (
  project_id uuid    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  level      integer NOT NULL,
  name       text    NOT NULL,
  PRIMARY KEY (project_id, level),
  CHECK (level >= 0)
);

-- Backfill from existing levels + global defs where available
INSERT INTO project_level_definitions (project_id, level, name)
SELECT DISTINCT
  apl.project_id,
  apl.current_level,
  COALESCE(d.name, 'L' || apl.current_level::text)
FROM agent_project_levels apl
LEFT JOIN agent_level_definitions d ON d.level_id = apl.current_level
ON CONFLICT (project_id, level) DO NOTHING;

-- Keep core current-state + event tables, drop extras
DROP TABLE IF EXISTS agent_level_proofs CASCADE;
DROP TABLE IF EXISTS agent_capability_evidence CASCADE;
DROP TABLE IF EXISTS agent_capability_levels CASCADE;
DROP TABLE IF EXISTS agent_level_definitions CASCADE;
