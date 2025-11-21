-- Expand group_invites to support receiver linkage and sender tracking
alter table public.group_invites
  add column if not exists sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists receiver_email text,
  add column if not exists receiver_id uuid references public.profiles(id) on delete set null;

-- Backfill new columns from existing data
update public.group_invites
set
  receiver_email = coalesce(receiver_email, email),
  sender_id = coalesce(sender_id, created_by)
where receiver_email is distinct from email or sender_id is null;

-- Ensure existing records keep lowercase emails for matching
update public.group_invites
set
  email = lower(email),
  receiver_email = lower(coalesce(receiver_email, email))
where email <> lower(email) or receiver_email <> lower(coalesce(receiver_email, email));

create index if not exists group_invites_receiver_id_idx on public.group_invites (receiver_id);
create index if not exists group_invites_receiver_email_idx on public.group_invites (receiver_email);
