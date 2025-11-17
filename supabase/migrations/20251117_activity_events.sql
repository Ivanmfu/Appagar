create extension if not exists "pgcrypto";

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid null,
  actor_id uuid null,
  action text not null check (action in (
    'expense_created',
    'expense_updated',
    'expense_deleted',
    'group_created',
    'group_deleted'
  )),
  payload jsonb null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.activity_events
  add constraint activity_events_group_id_fkey
  foreign key (group_id) references public.groups (id) on delete set null;

alter table public.activity_events
  add constraint activity_events_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete set null;

create index if not exists activity_events_group_created_idx
  on public.activity_events (group_id, created_at desc);

create index if not exists activity_events_actor_created_idx
  on public.activity_events (actor_id, created_at desc);

alter table public.activity_events enable row level security;

create policy "Activity events are viewable by members"
  on public.activity_events for select using (
    actor_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = activity_events.group_id
        and gm.user_id = auth.uid()
    )
  );

create policy "Users can insert their own activity events"
  on public.activity_events for insert with check (auth.uid() = actor_id);
