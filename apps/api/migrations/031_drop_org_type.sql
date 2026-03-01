-- Migration 031: Remove org type — relationship is defined by role, not type
alter table organisations drop column if exists type;
