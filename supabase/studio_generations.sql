-- Studio generations persisted per user (avatar, future: image/video tabs).
-- Run in Supabase SQL editor after main schema, or merge into schema.sql for new projects.

create table if not exists public.studio_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null,
  status text not null check (status in ('processing', 'ready', 'failed')),
  label text not null default '',
  external_task_id text not null,
  provider text not null default 'kie-market',
  result_urls text[],
  error_message text,
  credits_charged int not null default 0,
  uses_personal_api boolean not null default false,
  credits_refund_hint_sent boolean not null default false
);

create index if not exists studio_generations_user_kind_created_idx
  on public.studio_generations (user_id, kind, created_at desc);

create index if not exists studio_generations_cron_idx
  on public.studio_generations (status, uses_personal_api)
  where status = 'processing' and uses_personal_api = false;

create trigger studio_generations_set_updated_at
before update on public.studio_generations
for each row execute function public.set_updated_at();

alter table public.studio_generations enable row level security;

drop policy if exists "studio_generations_select_own" on public.studio_generations;
create policy "studio_generations_select_own"
on public.studio_generations
for select
using (auth.uid() = user_id);

drop policy if exists "studio_generations_insert_own" on public.studio_generations;
create policy "studio_generations_insert_own"
on public.studio_generations
for insert
with check (auth.uid() = user_id);

drop policy if exists "studio_generations_update_own" on public.studio_generations;
create policy "studio_generations_update_own"
on public.studio_generations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "studio_generations_delete_own" on public.studio_generations;
create policy "studio_generations_delete_own"
on public.studio_generations
for delete
using (auth.uid() = user_id);
