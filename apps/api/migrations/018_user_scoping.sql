-- 018_user_scoping: scope organisations and projects to their owning user
alter table organisations add column if not exists owner_user_id uuid references users(id) on delete set null;
alter table projects      add column if not exists owner_user_id uuid references users(id) on delete set null;

-- Backfill all existing orgs + projects to Sumesh (the original account)
update organisations set owner_user_id = '6924589a-642a-45b0-a590-03403e8e2bcb' where owner_user_id is null;
update projects      set owner_user_id = '6924589a-642a-45b0-a590-03403e8e2bcb' where owner_user_id is null;

create index if not exists orgs_owner_idx     on organisations (owner_user_id);
create index if not exists projects_owner_idx on projects      (owner_user_id);
