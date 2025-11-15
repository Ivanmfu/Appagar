-- Create group_invites table to manage invitation workflow
create table if not exists public.group_invites (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete cascade,
    email text not null,
    token text not null unique,
    status text not null default 'pending',
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    created_by uuid not null references public.profiles(id) on delete cascade
);

create index if not exists group_invites_group_id_idx on public.group_invites (group_id);
create index if not exists group_invites_email_idx on public.group_invites (email);
create index if not exists group_invites_token_idx on public.group_invites (token);

alter table if exists public.groups
    add column if not exists created_by uuid references public.profiles(id);

alter table if exists public.group_members
    add column if not exists role text default 'member';

comment on table public.group_invites is 'Stores invitations to join groups, including pending status and expiry handling.';
comment on column public.group_invites.status is 'pending | accepted | expired | revoked';
