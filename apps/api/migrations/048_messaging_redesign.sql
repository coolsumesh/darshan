-- ─────────────────────────────────────────────────────────────────────────────
-- 048_messaging_redesign.sql
-- Drop old messaging tables, create new threads / thread_participants /
-- thread_messages / notifications schema per spec.
-- Also drops a2a_routes (replaced by thread_participants).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop old tables (cascade handles dependent objects)
DROP TABLE IF EXISTS messages          CASCADE;
DROP TABLE IF EXISTS thread_participants CASCADE;
DROP TABLE IF EXISTS threads           CASCADE;
DROP TABLE IF EXISTS a2a_routes        CASCADE;

-- 2. threads ──────────────────────────────────────────────────────────────────
CREATE TABLE threads (
  thread_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject      text        NOT NULL,
  project_id   uuid        REFERENCES projects(id) ON DELETE SET NULL,
  created_by   uuid        NOT NULL,
  created_slug text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX idx_threads_created_by  ON threads(created_by);
CREATE INDEX idx_threads_project     ON threads(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_threads_deleted     ON threads(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX threads_subject_fts     ON threads
  USING gin(to_tsvector('english', subject));

-- 3. thread_participants ───────────────────────────────────────────────────────
CREATE TABLE thread_participants (
  thread_id        uuid        NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  participant_id   uuid        NOT NULL,
  participant_slug text        NOT NULL,
  added_by         uuid        NOT NULL,
  added_by_slug    text        NOT NULL,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  removed_at       timestamptz,
  PRIMARY KEY (thread_id, participant_id)
);

CREATE INDEX idx_thread_participants_pid    ON thread_participants(participant_id);
CREATE INDEX idx_thread_participants_active ON thread_participants(thread_id)
  WHERE removed_at IS NULL;

-- 4. thread_messages ──────────────────────────────────────────────────────────
CREATE TABLE thread_messages (
  message_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid        NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  reply_to    uuid        REFERENCES thread_messages(message_id) ON DELETE SET NULL,
  sender_id   uuid        NOT NULL,
  sender_slug text        NOT NULL,
  type        text        NOT NULL DEFAULT 'message'
                          CHECK (type IN ('message', 'event')),
  body        text        NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id, sent_at);
CREATE INDEX idx_thread_messages_sender ON thread_messages(sender_id);
CREATE INDEX idx_thread_messages_reply  ON thread_messages(reply_to)
  WHERE reply_to IS NOT NULL;
CREATE INDEX thread_messages_body_fts   ON thread_messages
  USING gin(to_tsvector('english', body));

-- 5. notifications ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  notification_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    uuid        NOT NULL,
  recipient_slug  text        NOT NULL,
  message_id      uuid        NOT NULL
                              REFERENCES thread_messages(message_id) ON DELETE CASCADE,
  priority        text        NOT NULL DEFAULT 'normal'
                              CHECK (priority IN ('high', 'normal', 'low')),
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','delivered','read','processed','expired')),
  response_note   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  read_at         timestamptz,
  processed_at    timestamptz,
  expires_at      timestamptz
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, status);
CREATE INDEX idx_notifications_message   ON notifications(message_id);
CREATE INDEX idx_notifications_pending   ON notifications(recipient_id)
  WHERE status = 'pending';
