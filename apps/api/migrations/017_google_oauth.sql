-- 017_google_oauth: add Google OAuth support to users table
alter table users add column if not exists google_id text unique;
alter table users alter column password_hash drop not null;
