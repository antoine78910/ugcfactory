-- Allow a `credits` redeem token to ALSO bundle complimentary plan access
-- (e.g. partner credit gift link that should ALSO grant Scale-tier features
-- for a fixed period). Plan-type tokens already grant the plan via plan_*
-- columns, so the bundle columns are only meaningful for grant_type='credits'.

alter table public.credit_redeem_tokens
  add column if not exists bundle_plan_id text;

alter table public.credit_redeem_tokens
  add column if not exists bundle_plan_billing text;

alter table public.credit_redeem_tokens
  add column if not exists bundle_plan_duration_days integer;

alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_bundle_plan_id_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_bundle_plan_id_chk
  check (
    bundle_plan_id is null
    or bundle_plan_id in ('starter', 'growth', 'pro', 'scale')
  );

alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_bundle_plan_billing_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_bundle_plan_billing_chk
  check (
    bundle_plan_billing is null
    or bundle_plan_billing in ('monthly', 'yearly')
  );

alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_bundle_plan_duration_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_bundle_plan_duration_chk
  check (
    bundle_plan_duration_days is null
    or bundle_plan_duration_days between 1 and 3650
  );

-- Bundle shape: all three bundle fields together, or all NULL.
-- Bundle is only allowed on credits tokens (plan tokens already carry their
-- own plan fields, so a bundle on top would be redundant and ambiguous).
alter table public.credit_redeem_tokens
  drop constraint if exists credit_redeem_tokens_bundle_shape_chk;
alter table public.credit_redeem_tokens
  add constraint credit_redeem_tokens_bundle_shape_chk
  check (
    (
      bundle_plan_id is null
      and bundle_plan_billing is null
      and bundle_plan_duration_days is null
    )
    or (
      grant_type = 'credits'
      and bundle_plan_id is not null
      and bundle_plan_billing is not null
      and bundle_plan_duration_days is not null
    )
  );
