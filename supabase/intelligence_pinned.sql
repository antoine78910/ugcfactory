-- User-pinned non-tracker brands (fallback for "Save as tracker" while
-- TrendTrack does not expose a public brandtracker creation endpoint).
-- Run once in Supabase SQL Editor.

create table if not exists intelligence_pinned (
  user_id uuid not null references auth.users(id) on delete cascade,
  advertiser_id text not null,
  name text not null,
  logo text,
  domain text,
  created_at timestamptz default now(),
  primary key (user_id, advertiser_id)
);

alter table intelligence_pinned enable row level security;

create policy "intelligence_pinned_select_own"
  on intelligence_pinned for select
  using (auth.uid() = user_id);

create policy "intelligence_pinned_insert_own"
  on intelligence_pinned for insert
  with check (auth.uid() = user_id);

create policy "intelligence_pinned_delete_own"
  on intelligence_pinned for delete
  using (auth.uid() = user_id);
