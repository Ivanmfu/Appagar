-- Revisa la vista de balances para filtrar usuarios activos y participaciones válidas
create or replace view public.group_balance as
with active_members as (
  select gm.group_id, gm.user_id
  from group_members gm
  where gm.is_active = true
)
select
  am.group_id,
  am.user_id,
  coalesce(
    (
      select sum(e.amount_base_minor)
      from expenses e
      join active_members payer on payer.group_id = e.group_id and payer.user_id = e.payer_id
      where e.group_id = am.group_id
        and payer.user_id = am.user_id
    ),
    0
  ) as total_paid_minor,
  coalesce(
    (
      select sum(ep.share_minor)
      from expense_participants ep
      join expenses e2 on e2.id = ep.expense_id
      join active_members participant on participant.group_id = e2.group_id and participant.user_id = ep.user_id
      where e2.group_id = am.group_id
        and ep.user_id = am.user_id
        and ep.is_included = true
    ),
    0
  ) as total_owed_minor,
  coalesce(
    (
      select sum(s.amount_minor)
      from settlements s
      where s.group_id = am.group_id
        and s.from_user_id = am.user_id
    ),
    0
  ) as settlements_paid_minor,
  coalesce(
    (
      select sum(s2.amount_minor)
      from settlements s2
      where s2.group_id = am.group_id
        and s2.to_user_id = am.user_id
    ),
    0
  ) as settlements_received_minor,
  coalesce(
    (
      select sum(e.amount_base_minor)
      from expenses e
      join active_members payer on payer.group_id = e.group_id and payer.user_id = e.payer_id
      where e.group_id = am.group_id
        and payer.user_id = am.user_id
    ),
    0
  )
  - coalesce(
    (
      select sum(ep.share_minor)
      from expense_participants ep
      join expenses e2 on e2.id = ep.expense_id
      join active_members participant on participant.group_id = e2.group_id and participant.user_id = ep.user_id
      where e2.group_id = am.group_id
        and ep.user_id = am.user_id
        and ep.is_included = true
    ),
    0
  )
  + coalesce(
    (
      select sum(s2.amount_minor)
      from settlements s2
      where s2.group_id = am.group_id
        and s2.to_user_id = am.user_id
    ),
    0
  )
  - coalesce(
    (
      select sum(s.amount_minor)
      from settlements s
      where s.group_id = am.group_id
        and s.from_user_id = am.user_id
    ),
    0
  ) as net_minor
from active_members am;
