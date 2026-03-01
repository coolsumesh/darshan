-- Migration 036: Backfill owner_user_id for legacy agents that were created
-- before the personal registry model. Assigns them to the org owner.

UPDATE agents a
SET owner_user_id = o.owner_user_id
FROM organisations o
WHERE a.org_id = o.id
  AND a.owner_user_id IS NULL
  AND o.owner_user_id IS NOT NULL;
