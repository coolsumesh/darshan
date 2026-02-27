-- 020_task_requestor_dates: requestor info + lifecycle timestamps on tasks
alter table tasks
  add column if not exists requestor_org  text,
  add column if not exists in_progress_at timestamptz,
  add column if not exists review_at      timestamptz;

-- Extend the existing completion trigger to handle in_progress + review dates too
create or replace function set_task_completed_at()
returns trigger as $$
begin
  -- in_progress_at: set once when first moving to in-progress
  if new.status = 'in-progress' and (old.status is distinct from 'in-progress') then
    new.in_progress_at = coalesce(old.in_progress_at, now());
  end if;

  -- review_at: set/update when moving to review
  if new.status = 'review' and (old.status is distinct from 'review') then
    new.review_at = now();
    -- Assign back to requestor (proposer) when sent for review
    if old.proposer is not null and old.proposer != '' then
      new.assignee = old.proposer;
    end if;
  end if;

  -- completed_at: set when done, clear when not
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at = now();
  end if;
  if new.status != 'done' then
    new.completed_at = null;
  end if;

  return new;
end;
$$ language plpgsql;

-- Recreate trigger (function already recreated above)
drop trigger if exists task_completed_at_trigger on tasks;
create trigger task_completed_at_trigger
  before update on tasks
  for each row execute function set_task_completed_at();
