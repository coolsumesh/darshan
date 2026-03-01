-- 032_user_session_invalidation: force-logout support
-- Setting sessions_invalidated_at to NOW() on a user row immediately invalidates
-- all their existing JWT cookies. The /me endpoint checks iat vs this column.
alter table users
  add column if not exists sessions_invalidated_at timestamptz;
