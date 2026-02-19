-- Phase 1: add priority + due_date to tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS due_date date;
