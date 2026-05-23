/* Link to Ad screen-recording template mode (no backend generation during replay). */

create table if not exists public.lta_template_recording_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.lta_template_brands (
  run_id uuid primary key,
  normalized_url text not null,
  store_url text not null,
  title text,
  thumb_url text,
  created_at timestamptz not null default now()
);

create index if not exists lta_template_brands_created_at_idx
  on public.lta_template_brands (created_at desc);

alter table public.lta_template_recording_users enable row level security;
alter table public.lta_template_brands enable row level security;

/* Service role only (API routes use createSupabaseServiceClient). */
create policy "service_role_lta_template_recording_users"
  on public.lta_template_recording_users
  for all
  using (false)
  with check (false);

create policy "service_role_lta_template_brands"
  on public.lta_template_brands
  for all
  using (false)
  with check (false);

insert into public.lta_template_recording_users (email)
values ('anto.delbos@gmail.com')
on conflict (email) do nothing;

notify pgrst, 'reload schema';
