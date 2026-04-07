-- Idempotent setup: works when `public.profiles` does not exist yet, or only needs
-- `first_name` + an updated trigger. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Table (minimal if missing)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists first_name text not null default '';

create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2) Trigger: copy email + first_name from auth (raw_user_meta_data.first_name)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn text;
begin
  fn := coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), '');
  insert into public.profiles (id, email, first_name)
  values (new.id, coalesce(new.email, ''), fn)
  on conflict (id) do update
    set email = excluded.email,
        first_name = case
          when excluded.first_name <> '' then excluded.first_name
          else public.profiles.first_name
        end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Optional: deferred "book a call" queue + backfill — see supabase/profiles_call_invite.sql
