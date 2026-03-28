-- Migration: user subscriptions + credit balances
-- IMPORTANT: also run the increment_user_credits function below (used by webhook).
-- Run this in Supabase → SQL Editor after deploying the Stripe webhook.

-- ---------------------------------------------------------------------------
-- user_subscriptions: mirrors the active Stripe subscription per user
-- ---------------------------------------------------------------------------
create table if not exists public.user_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references auth.users(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id     text not null,
  plan_id                text not null check (plan_id in ('starter', 'growth', 'pro', 'scale')),
  billing                text not null default 'monthly' check (billing in ('monthly', 'yearly')),
  status                 text not null default 'active',
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists user_subscriptions_user_idx on public.user_subscriptions (user_id);
create index if not exists user_subscriptions_stripe_sub_idx on public.user_subscriptions (stripe_subscription_id);

drop trigger if exists user_subscriptions_set_updated_at on public.user_subscriptions;
create trigger user_subscriptions_set_updated_at
  before update on public.user_subscriptions
  for each row execute function public.set_updated_at();

alter table public.user_subscriptions enable row level security;

drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
create policy "user_subscriptions_select_own"
  on public.user_subscriptions for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_credits: running credit balance per user
-- ---------------------------------------------------------------------------
create table if not exists public.user_credits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_credits_set_updated_at on public.user_credits;
create trigger user_credits_set_updated_at
  before update on public.user_credits
  for each row execute function public.set_updated_at();

alter table public.user_credits enable row level security;

drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own"
  on public.user_credits for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPC: atomically add credits (called by webhook with service role)
-- ---------------------------------------------------------------------------
create or replace function public.increment_user_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.user_credits (user_id, balance)
  values (p_user_id, p_amount)
  on conflict (user_id)
  do update set balance = public.user_credits.balance + excluded.balance,
                updated_at = now();
end;
$$;
