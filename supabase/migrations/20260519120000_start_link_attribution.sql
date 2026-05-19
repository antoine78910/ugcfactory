-- Internal attribution for youry.io/start (clicks → signup → payment).

create table if not exists public.start_link_clicks (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  clicked_at timestamptz not null default now()
);

create index if not exists start_link_clicks_clicked_at_idx
  on public.start_link_clicks (clicked_at desc);

create index if not exists start_link_clicks_visitor_id_idx
  on public.start_link_clicks (visitor_id);

create table if not exists public.start_link_attributions (
  visitor_id text primary key,
  first_clicked_at timestamptz not null default now(),
  user_id uuid unique references auth.users (id) on delete set null,
  signed_up_at timestamptz,
  paid_at timestamptz
);

create index if not exists start_link_attributions_signed_up_at_idx
  on public.start_link_attributions (signed_up_at desc)
  where signed_up_at is not null;

create index if not exists start_link_attributions_paid_at_idx
  on public.start_link_attributions (paid_at desc)
  where paid_at is not null;

alter table public.start_link_clicks enable row level security;
alter table public.start_link_attributions enable row level security;

-- No public policies: reads/writes go through the service role in API routes.
