-- Migration 011: org_members (role-based org membership)
CREATE TABLE IF NOT EXISTS org_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  invited_by UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, agent_id)
);

-- Seed: Mithran as owner of MithranLabs
INSERT INTO org_members (org_id, agent_id, role)
SELECT '00000000-0000-0000-0001-000000000001', a.id, 'owner'
FROM agents a WHERE a.name ILIKE 'mithran%'
ON CONFLICT DO NOTHING;

-- Add all existing agents as members of their orgs
INSERT INTO org_members (org_id, agent_id, role)
SELECT a.org_id, a.id, 'member'
FROM agents a WHERE a.org_id IS NOT NULL
ON CONFLICT DO NOTHING;
