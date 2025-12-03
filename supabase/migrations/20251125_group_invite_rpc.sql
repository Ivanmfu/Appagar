-- Drop the RPC first to avoid ownership/arg mismatch conflicts on re-deploys
drop function if exists public.respond_group_invite(uuid, text);

create or replace function public.respond_group_invite(
  p_invite_id uuid,
  p_action text
)
returns public.group_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.group_invites%rowtype;
  v_member public.group_members%rowtype;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_action not in ('accept', 'decline') then
    raise exception 'Invalid invite action: %', p_action;
  end if;

  select * into v_invite
  from public.group_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if v_invite.receiver_id is not null and v_invite.receiver_id <> v_user_id then
    raise exception 'Invite belongs to another user';
  end if;

  if p_action = 'accept' then
    if v_invite.status <> 'pending' then
      raise exception 'Invite is no longer pending';
    end if;

    select *
    into v_member
    from public.group_members
    where group_id = v_invite.group_id
      and user_id = v_user_id
    for update;

    if not found then
      insert into public.group_members (group_id, user_id, is_active)
      values (v_invite.group_id, v_user_id, true)
      on conflict (group_id, user_id)
        do update set is_active = true
      returning * into v_member;
    elsif coalesce(v_member.is_active, true) = false then
      update public.group_members
      set is_active = true
      where group_id = v_invite.group_id
        and user_id = v_user_id
      returning * into v_member;
    end if;

    update public.group_invites
    set status = 'accepted', receiver_id = v_user_id
    where id = p_invite_id
    returning * into v_invite;
  else
    update public.group_invites
    set status = 'declined', receiver_id = v_user_id
    where id = p_invite_id
    returning * into v_invite;
  end if;

  return v_invite;
end;
$$;

comment on function public.respond_group_invite(uuid, text)
  is 'Handles accepting or declining a group invite atomically with membership adjustments.';

grant execute on function public.respond_group_invite(uuid, text) to authenticated;
