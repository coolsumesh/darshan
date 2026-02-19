-- Add architecture and tech spec doc columns to projects
alter table projects
  add column if not exists architecture_doc text not null default '',
  add column if not exists tech_spec_doc text not null default '';
