-- Persist in-progress brand onboarding (projects-onboarding wizard) per user so steps can be resumed.

CREATE TABLE IF NOT EXISTS public.brand_onboarding_drafts (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  step       SMALLINT NOT NULL DEFAULT 1 CHECK (step >= 1 AND step <= 3),
  state      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.brand_onboarding_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_onboarding_drafts'
      AND policyname = 'users_select_own_brand_onboarding_drafts'
  ) THEN
    CREATE POLICY "users_select_own_brand_onboarding_drafts"
      ON public.brand_onboarding_drafts FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_onboarding_drafts'
      AND policyname = 'users_insert_own_brand_onboarding_drafts'
  ) THEN
    CREATE POLICY "users_insert_own_brand_onboarding_drafts"
      ON public.brand_onboarding_drafts FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_onboarding_drafts'
      AND policyname = 'users_update_own_brand_onboarding_drafts'
  ) THEN
    CREATE POLICY "users_update_own_brand_onboarding_drafts"
      ON public.brand_onboarding_drafts FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_onboarding_drafts'
      AND policyname = 'users_delete_own_brand_onboarding_drafts'
  ) THEN
    CREATE POLICY "users_delete_own_brand_onboarding_drafts"
      ON public.brand_onboarding_drafts FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_onboarding_drafts'
      AND policyname = 'service_role_all_brand_onboarding_drafts'
  ) THEN
    CREATE POLICY "service_role_all_brand_onboarding_drafts"
      ON public.brand_onboarding_drafts FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
