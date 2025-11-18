-- Añadir metadatos opcionales a los grupos
alter table public.groups
  add column if not exists group_type text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists description text;
