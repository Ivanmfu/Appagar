-- Optimize common dashboard and listing queries with supporting indexes

-- Accelerate membership lookups from the dashboard and activity feed
create index if not exists group_members_user_active_idx
  on public.group_members (user_id, is_active, group_id);
create index if not exists group_members_group_active_idx
  on public.group_members (group_id, is_active, user_id);

-- Speed up expense fetches ordered by date/creation in group detail pages
create index if not exists expenses_group_date_created_idx
  on public.expenses (group_id, date desc, created_at desc);

-- Improve participant scans when collecting shares for many expenses
create index if not exists expense_participants_expense_included_idx
  on public.expense_participants (expense_id, is_included, user_id);

-- Keep invite listings ordered without full table scans
create index if not exists group_invites_group_created_idx
  on public.group_invites (group_id, created_at desc);

-- Cover settlement listings scoped by group
create index if not exists settlements_group_idx
  on public.settlements (group_id);
