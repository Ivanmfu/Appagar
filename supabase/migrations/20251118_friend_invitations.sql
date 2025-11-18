create table if not exists public.friend_invitations (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  status text default 'pending'
);

alter table public.friend_invitations enable row level security;

create index if not exists friend_invitations_receiver_idx on public.friend_invitations(receiver_id);
create index if not exists friend_invitations_sender_idx on public.friend_invitations(sender_id);

create policy "Users can view their friend invitations" on public.friend_invitations
  for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can create friend invitations" on public.friend_invitations
  for insert
  with check (auth.uid() = sender_id);

create policy "Users can manage their friend invitations" on public.friend_invitations
  for update
  using (auth.uid() = sender_id or auth.uid() = receiver_id)
  with check (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can delete their friend invitations" on public.friend_invitations
  for delete
  using (auth.uid() = sender_id or auth.uid() = receiver_id);
