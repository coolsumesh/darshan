-- 046: Make agent slug nullable for human agents
-- Slug is only meaningful for AI agents (env var prefix e.g. AGENT_SANJAYA_ID).
-- Human agents created on OAuth login do not need a slug.

ALTER TABLE agents ALTER COLUMN slug DROP NOT NULL;
