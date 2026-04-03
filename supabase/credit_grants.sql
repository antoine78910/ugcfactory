-- Migration: credit grants ledger — expiry & non-accumulation rules
-- Replaces the simple user_credits.balance counter with per-grant tracking.
--
-- Rules:
--   • Pack (one-time) credits expire 3 months after purchase.
--   • Subscription credits reset each billing cycle (no carry-over).
--   • Spending deducts FIFO by expires_at (soonest-expiring first).

-- ---------------------------------------------------------------------------
-- user_credit_grants: one row per credit grant (subscription period or pack)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_credit_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source       text NOT NULL CHECK (source IN ('subscription', 'pack')),
  initial_amount integer NOT NULL CHECK (initial_amount > 0),
  remaining    integer NOT NULL CHECK (remaining >= 0),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_credit_grants_user_expires_idx
  ON public.user_credit_grants (user_id, expires_at)
  WHERE remaining > 0;

ALTER TABLE public.user_credit_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_grants_select_own" ON public.user_credit_grants;
CREATE POLICY "credit_grants_select_own"
  ON public.user_credit_grants FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPC: effective balance (sum of non-expired grants)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_credit_balance(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total integer;
BEGIN
  SELECT COALESCE(SUM(remaining), 0) INTO total
  FROM public.user_credit_grants
  WHERE user_id = p_user_id
    AND expires_at > now()
    AND remaining > 0;
  RETURN total;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: spend credits FIFO (earliest-expiring first)
-- Returns the number of credits actually spent (may be < p_amount if balance is low).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spend_user_credits_fifo(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  left_to_spend integer := p_amount;
  total_spent   integer := 0;
  g             RECORD;
  deduct        integer;
BEGIN
  FOR g IN
    SELECT id, remaining
    FROM public.user_credit_grants
    WHERE user_id = p_user_id
      AND expires_at > now()
      AND remaining > 0
    ORDER BY expires_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN left_to_spend <= 0;
    deduct := LEAST(left_to_spend, g.remaining);
    UPDATE public.user_credit_grants SET remaining = remaining - deduct WHERE id = g.id;
    left_to_spend := left_to_spend - deduct;
    total_spent   := total_spent + deduct;
  END LOOP;

  RETURN total_spent;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: refund credits — adds remaining back to the most-recently-created
-- non-expired grant for the user (or creates a pack grant expiring in 3 months
-- if none exists).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_user_credits(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id
  FROM public.user_credit_grants
  WHERE user_id = p_user_id
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF target_id IS NOT NULL THEN
    UPDATE public.user_credit_grants
    SET remaining = remaining + p_amount
    WHERE id = target_id;
  ELSE
    INSERT INTO public.user_credit_grants (user_id, source, initial_amount, remaining, expires_at)
    VALUES (p_user_id, 'pack', p_amount, p_amount, now() + INTERVAL '3 months');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: reset subscription credits
-- Zeroes out ALL previous subscription grants for the user, then creates a
-- fresh one with the given amount and expiry (= current_period_end).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_subscription_credits(
  p_user_id    uuid,
  p_amount     integer,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.user_credit_grants
  SET remaining = 0
  WHERE user_id = p_user_id
    AND source = 'subscription'
    AND remaining > 0;

  INSERT INTO public.user_credit_grants (user_id, source, initial_amount, remaining, expires_at)
  VALUES (p_user_id, 'subscription', p_amount, p_amount, p_expires_at);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: add pack credits with 3-month expiry
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_pack_credits(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_credit_grants (user_id, source, initial_amount, remaining, expires_at)
  VALUES (p_user_id, 'pack', p_amount, p_amount, now() + INTERVAL '3 months');
END;
$$;

-- ---------------------------------------------------------------------------
-- Keep legacy user_credits in sync (optional — update trigger).
-- After any change to user_credit_grants, recompute the user_credits.balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_credits_balance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  uid uuid;
  bal integer;
BEGIN
  uid := COALESCE(NEW.user_id, OLD.user_id);
  SELECT COALESCE(SUM(remaining), 0) INTO bal
  FROM public.user_credit_grants
  WHERE user_id = uid AND expires_at > now() AND remaining > 0;

  INSERT INTO public.user_credits (user_id, balance)
  VALUES (uid, bal)
  ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = now();

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_credits_after_grant_change ON public.user_credit_grants;
CREATE TRIGGER sync_credits_after_grant_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_credit_grants
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_credits_balance();
