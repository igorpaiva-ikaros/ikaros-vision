create type public.app_role as enum ('admin', 'viewer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_internal(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','viewer'))
$$;

-- Snapshot of the last Notion read (single logical row, key = 'notion').
create table public.sync_snapshots (
  key text primary key,
  payload jsonb,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
grant select on public.sync_snapshots to authenticated;
grant all on public.sync_snapshots to service_role;
alter table public.sync_snapshots enable row level security;
create policy "Internal users read snapshots" on public.sync_snapshots
  for select to authenticated using (public.is_internal(auth.uid()));
