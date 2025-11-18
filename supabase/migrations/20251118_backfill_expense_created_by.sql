-- Backfill missing created_by values on expenses so RLS policies continue working
begin;

update public.expenses
set created_by = payer_id
where created_by is null
	and payer_id is not null;

commit;
