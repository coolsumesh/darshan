-- Migration 056: Add description and gate columns to project_level_definitions
ALTER TABLE project_level_definitions
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS gate TEXT;
