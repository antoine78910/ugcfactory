-- Migration: user_onboarding table
-- Run this once against your Supabase project to enable onboarding data storage.
-- Dashboard: SQL Editor → paste and run, or use: supabase db query < this_file.sql

CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  work_type      TEXT,
  referral_source TEXT,
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own row
CREATE POLICY "users_select_own_onboarding"
  ON public.user_onboarding FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_onboarding"
  ON public.user_onboarding FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_onboarding"
  ON public.user_onboarding FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Service role bypass (for server-side upserts via the API route)
CREATE POLICY "service_role_all_onboarding"
  ON public.user_onboarding FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
