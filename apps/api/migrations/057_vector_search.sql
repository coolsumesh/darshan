-- Migration 057: Vector search for thread messages
-- Enables semantic search across thread content using pgvector

-- Enable pgvector extension (Neon supports this natively)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to thread_messages
-- 1536 dimensions = OpenAI text-embedding-3-small / text-embedding-ada-002
ALTER TABLE thread_messages
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- HNSW index for fast approximate nearest-neighbour search
-- Better than IVFFlat for real-time inserts (no need to rebuild)
CREATE INDEX IF NOT EXISTS thread_messages_embedding_hnsw
  ON thread_messages
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Add summary column to threads for compacted memory
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz;

-- Track which threads are feature threads (for Sanjaya memory)
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS thread_type text DEFAULT 'conversation'
    CHECK (thread_type IN ('conversation', 'feature', 'level_test', 'dm'));

-- Mark existing feature threads
UPDATE threads
SET thread_type = 'feature'
WHERE subject LIKE 'Feature:%';

-- Mark level test threads
UPDATE threads
SET thread_type = 'level_test'
WHERE subject LIKE 'L_ Test -%' OR subject LIKE 'L__ Test -%';

-- Semantic search helper function
-- Returns messages ranked by cosine similarity to a query embedding
CREATE OR REPLACE FUNCTION search_thread_messages(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  message_id uuid,
  thread_id uuid,
  thread_subject text,
  body text,
  sender_slug text,
  sent_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    tm.message_id,
    tm.thread_id,
    t.subject AS thread_subject,
    tm.body,
    tm.sender_slug,
    tm.sent_at,
    1 - (tm.embedding <=> query_embedding) AS similarity
  FROM thread_messages tm
  JOIN threads t ON t.thread_id = tm.thread_id
  WHERE
    tm.embedding IS NOT NULL
    AND 1 - (tm.embedding <=> query_embedding) > match_threshold
    AND (filter_project_id IS NULL OR t.project_id = filter_project_id)
    AND t.deleted_at IS NULL
  ORDER BY tm.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Record migration
INSERT INTO schema_migrations (id, applied_at)
VALUES ('057_vector_search', NOW())
ON CONFLICT (id) DO NOTHING;
