-- Extend credit gift links: allow granting a subscription plan (not just credits).
-- Also introduces `complimentary_subscriptions` which gives a user access to a
-- plan tier without requiring a Stripe subscription (used for partners that
-- cannot / do not want to pay by card).

-- ---------------------------------------------------------------------------
-- credit_redeem_tokens: new grant_type + optional plan columns
-- ---------------------------------------------------------------------------
alter table public.credit_redeem_tokens
  add column if not exists grant_type text not null default 'credits';

alter table public.credit_redeem_tokens
  add column if not exists plan_id text;

alter table public.credit_redeem_tokens
  add column if not exists plan_billing text;

alter table public.credit_redeem_tokens
  add column if not exists plan_duration_days integer;

alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_grant_type_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_grant_type_chk
  check (grant_type in ('credits', 'plan'));

alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_plan_id_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_plan_id_chk
  check (plan_id is null or plan_id in ('starter', 'growth', 'pro', 'scale'));

alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_plan_billing_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_plan_billing_chk
  check (plan_billing is null or plan_billing in ('monthly', 'yearly'));

alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_plan_duration_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_plan_duration_chk
  check (plan_duration_days is null or (plan_duration_days between 1 and 3650));

-- Enforce shape: credits tokens keep plan fields NULL, plan tokens have them all.
alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_grant_shape_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_grant_shape_chk
  check (
    (grant_type = 'credits'
      and plan_id is null
      and plan_billing is null
      and plan_duration_days is null)
    or
    (grant_type = 'plan'
      and plan_id is not null
      and plan_billing is not null
      and plan_duration_days is not null)
  );

-- ---------------------------------------------------------------------------
-- credit_redeem_logs: capture grant shape for audit
-- ---------------------------------------------------------------------------
alter table public.credit_redeem_logs
  add column if not exists grant_type text not null default 'credits';

alter table public.credit_redeem_logs
  add column if not exists plan_id text;

alter table public.credit_redeem_logs
  add column if not exists plan_billing text;

alter table public.credit_redeem_logs
  add column if not exists plan_expires_at timestamptz;

alter table public.credit_redeem_logs
  drop constraint if exists credit_redeem_logs_grant_type_chk;
alter table public.credit_redeem_logs
  add constraint credit_redeem_logs_grant_type_chk
  check (grant_type in ('credits', 'plan'));

-- ---------------------------------------------------------------------------
-- complimentary_subscriptions: admin-granted plan access with no Stripe row
-- ---------------------------------------------------------------------------
-- Separate from `user_subscriptions` (which is kept strictly in sync with
-- Stripe; `/api/me/subscription` zeros it out when Stripe reports no active
-- sub for the email). Comp subs live independently and are merged at read
-- time.
create table if not exists public.complimentary_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_id     text not null check (plan_id in ('starter', 'growth', 'pro', 'scale')),
  billing     text not null check (billing in ('monthly', 'yearly')),
  token_id    uuid references public.credit_redeem_tokens(id) on delete set null,
  source      text not null default 'partner_link'
              check (source in ('partner_link', 'admin_manual')),
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists complimentary_subscriptions_user_idx
  on public.complimentary_subscriptions (user_id);

create index if not exists complimentary_subscriptions_user_active_idx
  on public.complimentary_subscriptions (user_id, expires_at)
  where revoked_at is null;

alter table public.complimentary_subscriptions enable row level security;

drop policy if exists "comp_subs_select_own" on public.complimentary_subscriptions;
create policy "comp_subs_select_own"
  on public.complimentary_subscriptions for select
  using (auth.uid() = user_id);

comment on table public.complimentary_subscriptions is
  'Admin-granted plan access (e.g. partner giveaway) that does not require a Stripe subscription. Read in parallel with user_subscriptions; the effective plan is the highest non-expired tier.';
