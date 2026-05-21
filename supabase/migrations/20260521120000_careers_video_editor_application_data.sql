-- Structured answers for role-specific application forms (e.g. smart-video-editor).
alter table public.careers_applications
  add column if not exists application_data jsonb;

create index if not exists careers_applications_application_data_idx
  on public.careers_applications using gin (application_data);
