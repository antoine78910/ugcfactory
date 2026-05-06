-- Intelligence recreations: per-user history of "Recreate" generations (ads cloning, etc.).

CREATE TABLE IF NOT EXISTS public.intelligence_recreations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'ad_recreate',
  source_ad_id     TEXT,
  source_brand     TEXT,
  source_platform  TEXT,
  source_hook      TEXT,
  prompt           TEXT,
  model            TEXT,
  task_id          TEXT,
  output_video_url TEXT,
  meta             JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_recreations_user_id_idx
  ON public.intelligence_recreations (user_id);

CREATE INDEX IF NOT EXISTS intelligence_recreations_created_at_idx
  ON public.intelligence_recreations (created_at DESC);

ALTER TABLE public.intelligence_recreations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_recreations'
      AND policyname = 'users_select_own_intelligence_recreations'
  ) THEN
    CREATE POLICY "users_select_own_intelligence_recreations"
      ON public.intelligence_recreations FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_recreations'
      AND policyname = 'users_insert_own_intelligence_recreations'
  ) THEN
    CREATE POLICY "users_insert_own_intelligence_recreations"
      ON public.intelligence_recreations FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_recreations'
      AND policyname = 'users_delete_own_intelligence_recreations'
  ) THEN
    CREATE POLICY "users_delete_own_intelligence_recreations"
      ON public.intelligence_recreations FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_recreations'
      AND policyname = 'service_role_all_intelligence_recreations'
  ) THEN
    CREATE POLICY "service_role_all_intelligence_recreations"
      ON public.intelligence_recreations FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Force PostgREST to reload schema cache (fixes PGRST205 right after migrations).
NOTIFY pgrst, 'reload schema';

