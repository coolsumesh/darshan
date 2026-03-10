-- Migration 054: Add status to threads (open / closed / archived)
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'archived'));

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
