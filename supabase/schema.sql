-- Supabase schema for UGC Factory (runs + simple GPT cache)

create extension if not exists "pgcrypto";

-- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Main entity: a saved run of the wizard
create table if not exists public.ugc_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  store_url text not null,
  title text,
  extracted jsonb,
  analysis jsonb,
  quiz jsonb,
  packshot_urls text[],
  image_prompt text,
  negative_prompt text,
  generated_image_urls text[],
  selected_image_url text,
  video_template_id text,
  video_prompt text,
  video_url text
);

create index if not exists ugc_runs_user_created_at_idx
  on public.ugc_runs (user_id, created_at desc);

create trigger ugc_runs_set_updated_at
before update on public.ugc_runs
for each row execute function public.set_updated_at();

-- Optional cache to reduce repeated GPT calls
create table if not exists public.gpt_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null,
  cache_key text not null,
  output jsonb not null
);

create unique index if not exists gpt_cache_unique
  on public.gpt_cache (user_id, kind, cache_key);

-- RLS
alter table public.ugc_runs enable row level security;
alter table public.gpt_cache enable row level security;

drop policy if exists "ugc_runs_select_own" on public.ugc_runs;
create policy "ugc_runs_select_own"
on public.ugc_runs
for select
using (auth.uid() = user_id);

drop policy if exists "ugc_runs_insert_own" on public.ugc_runs;
create policy "ugc_runs_insert_own"
on public.ugc_runs
for insert
with check (auth.uid() = user_id);

drop policy if exists "ugc_runs_update_own" on public.ugc_runs;
create policy "ugc_runs_update_own"
on public.ugc_runs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ugc_runs_delete_own" on public.ugc_runs;
create policy "ugc_runs_delete_own"
on public.ugc_runs
for delete
using (auth.uid() = user_id);

drop policy if exists "gpt_cache_select_own" on public.gpt_cache;
create policy "gpt_cache_select_own"
on public.gpt_cache
for select
using (auth.uid() = user_id);

drop policy if exists "gpt_cache_insert_own" on public.gpt_cache;
create policy "gpt_cache_insert_own"
on public.gpt_cache
for insert
with check (auth.uid() = user_id);

drop policy if exists "gpt_cache_delete_own" on public.gpt_cache;
create policy "gpt_cache_delete_own"
on public.gpt_cache
for delete
using (auth.uid() = user_id);

