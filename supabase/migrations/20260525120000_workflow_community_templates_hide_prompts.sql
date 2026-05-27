-- Public template links: blur prompts for signed-out viewers when enabled (default on).
alter table public.workflow_community_templates
  add column if not exists hide_prompts_for_guests boolean not null default true;
