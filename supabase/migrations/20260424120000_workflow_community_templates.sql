-- Shared workflow templates: readable by any signed-in user; insert only as self.
create table if not exists public.workflow_community_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  blurb text not null default '',
  project jsonb not null
);

create index if not exists workflow_community_templates_created_at_idx
  on public.workflow_community_templates (created_at desc);

alter table public.workflow_community_templates enable row level security;

drop policy if exists "workflow_community_templates_select_authenticated"
  on public.workflow_community_templates;
create policy "workflow_community_templates_select_authenticated"
on public.workflow_community_templates
for select
to authenticated
using (true);

drop policy if exists "workflow_community_templates_insert_own"
  on public.workflow_community_templates;
create policy "workflow_community_templates_insert_own"
on public.workflow_community_templates
for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "workflow_community_templates_delete_own"
  on public.workflow_community_templates;
create policy "workflow_community_templates_delete_own"
on public.workflow_community_templates
for delete
to authenticated
using (auth.uid() = created_by);
