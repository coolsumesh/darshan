-- Migration 023: Store avatar URL on users (populated from Google OAuth picture)
alter table users add column if not exists avatar_url text;
