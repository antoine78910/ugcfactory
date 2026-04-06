-- Profiles row per auth user + queue for deferred "book a call" email (Resend via Edge Functions).
-- Apply in Supabase SQL Editor (or supabase db push). Idempotent.

-- 1) profiles (created on signup via trigger)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null default now()
);

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

-- 2) Queue: populated by Database Webhook Edge Function; processed by cron Edge Function
create table if not exists public.signup_call_invite_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  send_after timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists signup_call_invite_queue_due_idx
  on public.signup_call_invite_queue (send_after)
  where sent_at is null;

alter table public.signup_call_invite_queue enable row level security;
-- No user-facing policies: only service role (Edge Functions) accesses this table.

-- 3) After signup, insert profile (webhook on profiles INSERT schedules the queue row)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Repair missing queue rows if a webhook failed (idempotent inserts)
create or replace function public.backfill_signup_call_invite_queue()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.signup_call_invite_queue (user_id, email, send_after)
  select
    p.id,
    p.email,
    p.created_at + interval '3 days'
  from public.profiles p
  left join public.signup_call_invite_queue q on q.user_id = p.id
  where q.user_id is null
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.backfill_signup_call_invite_queue() from public;
grant execute on function public.backfill_signup_call_invite_queue() to service_role;

-- Optional one-time backfill for users who signed up before this migration:
-- insert into public.profiles (id, email)
-- select id, coalesce(email, '') from auth.users
-- on conflict (id) do nothing;
