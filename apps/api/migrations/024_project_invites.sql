-- Migration 024: Project invite links (human collaborator invitations)
create table if not exists project_invites (
  id            uuid        primary key default gen_random_uuid(),
  project_id    uuid        not null references projects(id) on delete cascade,
  token         text        not null unique default encode(gen_random_bytes(24), 'hex'),
  role          text        not null default 'member' check (role in ('admin', 'member')),
  invited_by    uuid        references users(id) on delete set null,
  invitee_email text,       -- if set, only this email can accept; also drives notification bell
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_by   uuid        references users(id) on delete set null,
  accepted_at   timestamptz,
  declined_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists project_invites_project_idx on project_invites(project_id);
create index if not exists project_invites_token_idx   on project_invites(token);
create index if not exists project_invites_email_idx   on project_invites(lower(invitee_email))
  where invitee_email is not null;
