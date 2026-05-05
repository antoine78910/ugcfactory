-- Intelligence dashboard TTL cache (TrendTrack + Claude-derived blocks).
-- Run once in Supabase SQL Editor or via CLI migrate.

create table if not exists intelligence_cache (
  key text primary key,
  data jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
