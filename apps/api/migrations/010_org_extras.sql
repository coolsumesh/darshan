-- Migration 010: org extras (avatar_color, updated_at, status)
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS avatar_color text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS status       text DEFAULT 'active';
