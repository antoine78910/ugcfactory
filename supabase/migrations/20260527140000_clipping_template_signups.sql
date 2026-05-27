-- Attribution for /start/clipping → signup → Link to Ad template access (admin-granted).

create table if not exists public.clipping_template_signup_clicks (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  clicked_at timestamptz not null default now()
);

create index if not exists clipping_template_signup_clicks_clicked_at_idx
  on public.clipping_template_signup_clicks (clicked_at desc);

create index if not exists clipping_template_signup_clicks_visitor_id_idx
  on public.clipping_template_signup_clicks (visitor_id);

create table if not exists public.clipping_template_signups (
  visitor_id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  first_clicked_at timestamptz not null default now(),
  signed_up_at timestamptz,
  template_access_granted_at timestamptz
);

create index if not exists clipping_template_signups_signed_up_at_idx
  on public.clipping_template_signups (signed_up_at desc)
  where signed_up_at is not null;

create index if not exists clipping_template_signups_email_idx
  on public.clipping_template_signups (email);

alter table public.clipping_template_signup_clicks enable row level security;
alter table public.clipping_template_signups enable row level security;

notify pgrst, 'reload schema';
