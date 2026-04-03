-- One-time migration: ledger units become "half-credit ticks" (2 ticks = 1.0 display credit).
-- Required for 0.5-credit models (e.g. Google Nano Banana). Run in Supabase SQL editor
-- before or with deploying the app code that uses displayCreditsToLedgerTicks / ledgerTicksToDisplayCredits.
--
-- After this:
--   • user_credit_grants.remaining / initial_amount are in ticks (double previous value).
--   • studio_generations.credits_charged is in ticks (double previous value).
--   • get_user_credit_balance RPC still returns sum(remaining); the app divides by 2 for display.

UPDATE public.user_credit_grants
SET
  remaining = remaining * 2,
  initial_amount = initial_amount * 2;

UPDATE public.studio_generations
SET credits_charged = credits_charged * 2
WHERE credits_charged > 0;

-- Optional legacy mirror table (if present): re-sync from grants by touching grants or run:
-- UPDATE public.user_credits uc SET balance = (
--   SELECT COALESCE(SUM(g.remaining), 0) FROM public.user_credit_grants g
--   WHERE g.user_id = uc.user_id AND g.expires_at > now() AND g.remaining > 0
-- );
