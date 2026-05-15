-- Brand projects: deep onboarding (own site + competitors) stored per user for /projects-onboarding.

CREATE TABLE IF NOT EXISTS public.brand_projects (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  site_url           TEXT NOT NULL,
  site_name          TEXT,
  site_pages         JSONB NOT NULL DEFAULT '[]'::jsonb,
  site_analysis      JSONB NOT NULL DEFAULT '{}'::jsonb,
  marketing_angles   JSONB NOT NULL DEFAULT '[]'::jsonb,
  competitors        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_projects_user_id_idx
  ON public.brand_projects (user_id);

CREATE INDEX IF NOT EXISTS brand_projects_user_updated_idx
  ON public.brand_projects (user_id, updated_at DESC);

ALTER TABLE public.brand_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_projects'
      AND policyname = 'users_select_own_brand_projects'
  ) THEN
    CREATE POLICY "users_select_own_brand_projects"
      ON public.brand_projects FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_projects'
      AND policyname = 'users_insert_own_brand_projects'
  ) THEN
    CREATE POLICY "users_insert_own_brand_projects"
      ON public.brand_projects FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_projects'
      AND policyname = 'users_update_own_brand_projects'
  ) THEN
    CREATE POLICY "users_update_own_brand_projects"
      ON public.brand_projects FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_projects'
      AND policyname = 'users_delete_own_brand_projects'
  ) THEN
    CREATE POLICY "users_delete_own_brand_projects"
      ON public.brand_projects FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_projects'
      AND policyname = 'service_role_all_brand_projects'
  ) THEN
    CREATE POLICY "service_role_all_brand_projects"
      ON public.brand_projects FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
