-- Migration 028: org_user_invites
-- Invite human users to join an organisation by email.
-- Separate from org_members (which links AI agents to orgs).

create table if not exists org_user_invites (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references organisations(id) on delete cascade,
  invitee_email text        not null,
  invited_by    uuid        references users(id),
  role          text        not null default 'member'
                            check (role in ('owner', 'admin', 'member')),
  token         text        not null unique default encode(gen_random_bytes(32), 'hex'),
  accepted_at   timestamptz,
  declined_at   timestamptz,
  expires_at    timestamptz not null default now() + interval '7 days',
  created_at    timestamptz not null default now()
);

create index if not exists org_user_invites_email_idx on org_user_invites (lower(invitee_email));
create index if not exists org_user_invites_org_idx   on org_user_invites (org_id);
create index if not exists org_user_invites_token_idx on org_user_invites (token);
