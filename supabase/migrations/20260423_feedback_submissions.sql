-- Migration: feedback submissions table
-- Stores in-app user feedback, feature requests, and bug reports.

CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  category    TEXT NOT NULL DEFAULT 'feedback',
  message     TEXT NOT NULL,
  page_path   TEXT,
  status      TEXT NOT NULL DEFAULT 'new',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_created_at_idx
  ON public.feedback_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_submissions_user_id_idx
  ON public.feedback_submissions (user_id);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_feedback"
  ON public.feedback_submissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_feedback"
  ON public.feedback_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_all_feedback"
  ON public.feedback_submissions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

