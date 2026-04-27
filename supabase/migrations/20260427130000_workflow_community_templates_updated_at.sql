alter table public.workflow_community_templates
  add column if not exists updated_at timestamptz not null default now();
