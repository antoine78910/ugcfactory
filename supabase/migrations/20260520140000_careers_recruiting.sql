-- Careers funnel analytics + job applications (service role / API only; RLS enabled, no public policies).
--
-- Run via Supabase CLI: supabase db push
-- Storage bucket holds optional resume uploads (private).

create table if not exists public.careers_funnel_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  visitor_id text not null,
  event_type text not null,
  job_slug text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists careers_funnel_events_created_at_idx
  on public.careers_funnel_events (created_at desc);

create index if not exists careers_funnel_events_visitor_id_idx
  on public.careers_funnel_events (visitor_id);

create index if not exists careers_funnel_events_event_type_idx
  on public.careers_funnel_events (event_type);

create table if not exists public.careers_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  visitor_id text,
  job_slug text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  resume_storage_path text,
  linkedin_url text,
  twitter_url text,
  github_url text,
  built_created text,
  portfolio text,
  first_month_build text,
  salary_expectation_eur text,
  ai_workflow text,
  relocate_open text,
  anything_else text,
  privacy_accepted boolean not null default false
);

create index if not exists careers_applications_created_at_idx
  on public.careers_applications (created_at desc);

create index if not exists careers_applications_job_slug_idx
  on public.careers_applications (job_slug);

create index if not exists careers_applications_email_idx
  on public.careers_applications (email);

alter table public.careers_funnel_events enable row level security;
alter table public.careers_applications enable row level security;

-- Private bucket for resumes; uploads only via service role in Next API routes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'careers-resumes',
  'careers-resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf',
    'text/rtf',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
