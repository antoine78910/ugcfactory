-- Recreate workflow: persist analysis, brand assets, and GPT Image 2 keyframe outputs per scene.

CREATE TABLE IF NOT EXISTS public.recreate_projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                TEXT NOT NULL DEFAULT 'Recreate project',
  status               TEXT NOT NULL DEFAULT 'in_progress',
  video_url            TEXT,
  video_file_name      TEXT,
  duration_sec         DOUBLE PRECISION,
  analysis_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  product_image_url    TEXT,
  packaging_image_url  TEXT,
  logo_image_url       TEXT,
  keyframes_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_state_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recreate_projects_user_id_idx
  ON public.recreate_projects (user_id);

CREATE INDEX IF NOT EXISTS recreate_projects_updated_at_idx
  ON public.recreate_projects (user_id, updated_at DESC);

ALTER TABLE public.recreate_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recreate_projects'
      AND policyname = 'users_select_own_recreate_projects'
  ) THEN
    CREATE POLICY "users_select_own_recreate_projects"
      ON public.recreate_projects FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recreate_projects'
      AND policyname = 'users_insert_own_recreate_projects'
  ) THEN
    CREATE POLICY "users_insert_own_recreate_projects"
      ON public.recreate_projects FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recreate_projects'
      AND policyname = 'users_update_own_recreate_projects'
  ) THEN
    CREATE POLICY "users_update_own_recreate_projects"
      ON public.recreate_projects FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recreate_projects'
      AND policyname = 'users_delete_own_recreate_projects'
  ) THEN
    CREATE POLICY "users_delete_own_recreate_projects"
      ON public.recreate_projects FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recreate_projects'
      AND policyname = 'service_role_all_recreate_projects'
  ) THEN
    CREATE POLICY "service_role_all_recreate_projects"
      ON public.recreate_projects FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
