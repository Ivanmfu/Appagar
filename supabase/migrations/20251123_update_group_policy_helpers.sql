-- Harden helper functions to avoid recursive RLS evaluation

create or replace function public.is_group_member(group_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_id uuid;
begin
  current_member_id := auth.uid();
  if current_member_id is null then
    return false;
  end if;

  -- Disable row level security inside helper to avoid recursion when used in policies
  perform set_config('row_security', 'off', true);

  return exists (
    select 1
    from public.group_members gm
    where gm.group_id = group_uuid
      and gm.user_id = current_member_id
      and coalesce(gm.is_active, true)
  );
end;
$$;

comment on function public.is_group_member(uuid)
  is 'Checks whether the authenticated user is an active member of the given group without triggering recursive RLS.';

create or replace function public.is_group_owner(group_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_id uuid;
begin
  current_member_id := auth.uid();
  if current_member_id is null then
    return false;
  end if;

  perform set_config('row_security', 'off', true);

  if exists (
    select 1
    from public.groups g
    where g.id = group_uuid
      and g.created_by = current_member_id
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.group_members gm
    where gm.group_id = group_uuid
      and gm.user_id = current_member_id
      and gm.role = 'owner'
      and coalesce(gm.is_active, true)
  );
end;
$$;

comment on function public.is_group_owner(uuid)
  is 'Checks whether the authenticated user owns the given group without triggering recursive RLS.';
