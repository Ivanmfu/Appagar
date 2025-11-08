-- Crea una vista opcional para simplificar consultas
create or replace view public.group_balance as
select
  g.id as group_id,
  p.id as user_id,
  coalesce(sum(case when e.payer_id = p.id then e.amount_base_minor else 0 end),0)
  - coalesce((
    select sum(ep.share_minor)
    from expense_participants ep
    join expenses e2 on e2.id = ep.expense_id
    where e2.group_id = g.id and ep.user_id = p.id
  ),0)
  + coalesce((
    select sum(s.amount_minor)
    from settlements s
    where s.group_id = g.id and s.to_user_id = p.id
  ),0)
  - coalesce((
    select sum(s2.amount_minor)
    from settlements s2
    where s2.group_id = g.id and s2.from_user_id = p.id
  ),0)
  as net_minor
from groups g
join group_members gm on gm.group_id = g.id and gm.is_active = true
join profiles p on p.id = gm.user_id
left join expenses e on e.group_id = g.id
group by g.id, p.id;
