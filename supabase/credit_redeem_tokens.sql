-- Migration: redeemable credit tokens (gift / promo links).
--
-- Each token is a UUID secret with a defined credit amount and optional constraints:
--   • max_uses: how many times the token can be redeemed (NULL = unlimited).
--   • expires_at: hard deadline after which the token is no longer valid.
--   • One user can redeem a given token only once (unique constraint).

-- ---------------------------------------------------------------------------
-- credit_redeem_tokens: one row per token you generate
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_redeem_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The secret sent in the link (?token=<secret>). Separate from PK so it
  -- can be regenerated without changing FK references.
  secret      text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label       text,                           -- admin memo ("100 credits for John")
  amount      integer NOT NULL CHECK (amount > 0),  -- display credits (not ticks)
  max_uses    integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count  integer NOT NULL DEFAULT 0,
  expires_at  timestamptz,                    -- NULL = never expires
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_redeem_tokens ENABLE ROW LEVEL SECURITY;

-- No public SELECT — tokens are read only by the service role in API routes.

-- ---------------------------------------------------------------------------
-- credit_redeem_logs: one row per successful redemption
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_redeem_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    uuid NOT NULL REFERENCES public.credit_redeem_tokens(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      integer NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_id, user_id)                  -- one redemption per user per token
);

ALTER TABLE public.credit_redeem_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "redeem_logs_select_own" ON public.credit_redeem_logs;
CREATE POLICY "redeem_logs_select_own"
  ON public.credit_redeem_logs FOR SELECT
  USING (auth.uid() = user_id);
