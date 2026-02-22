-- 014_users_auth: users table for authentication
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text not null,
  password_hash text not null,
  role        text not null default 'admin',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Seed default admin user: Sumesh / password: darshan123
-- bcrypt hash of "darshan123" with cost 10 (regenerated 2026-02-22)
insert into users (email, name, password_hash, role)
values (
  'sumesh@mithranLabs.com',
  'Sumesh',
  '$2b$10$Gvvjdf9BdlXzRC/e1ZTPRO4ce5sFBWFLGAnxsBGdqzIqMDmVWuh72',
  'admin'
) on conflict (email) do nothing;
