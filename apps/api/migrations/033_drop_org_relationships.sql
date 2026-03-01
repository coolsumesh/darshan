-- Migration 033: Drop org_relationships table
-- This table tracked org↔org federation links but was never used
-- and has no application code referencing it. Safe to remove.

DROP TABLE IF EXISTS org_relationships;
