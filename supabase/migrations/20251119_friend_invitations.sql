-- Habilitar extensiones necesarias para UUID
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Crear tabla de invitaciones de amistad
create table if not exists public.friend_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  status text default 'pending'
);

-- Activar Row Level Security
alter table public.friend_invitations enable row level security;

-- Índices
create index if not exists friend_invitations_receiver_idx 
  on public.friend_invitations(receiver_id);

create index if not exists friend_invitations_sender_idx 
  on public.friend_invitations(sender_id);

-- Políticas de RLS (se crean solo si no existen)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'friend_invitations'
      and policyname = 'Users can view their friend invitations'
  ) then
    create policy "Users can view their friend invitations"
      on public.friend_invitations
      for select
      using (auth.uid() = sender_id or auth.uid() = receiver_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'friend_invitations'
      and policyname = 'Users can create friend invitations'
  ) then
    create policy "Users can create friend invitations"
      on public.friend_invitations
      for insert
      with check (auth.uid() = sender_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'friend_invitations'
      and policyname = 'Users can manage their friend invitations'
  ) then
    create policy "Users can manage their friend invitations"
      on public.friend_invitations
      for update
      using (auth.uid() = sender_id or auth.uid() = receiver_id)
      with check (auth.uid() = sender_id or auth.uid() = receiver_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'friend_invitations'
      and policyname = 'Users can delete their friend invitations'
  ) then
    create policy "Users can delete their friend invitations"
      on public.friend_invitations
      for delete
      using (auth.uid() = sender_id or auth.uid() = receiver_id);
  end if;
end
$$;

