-- Intelligence trackers: per-user saved tracker list for /intelligence.

CREATE TABLE IF NOT EXISTS public.intelligence_trackers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tracker_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  logo       TEXT,
  domain     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_trackers_user_id_idx
  ON public.intelligence_trackers (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_trackers_user_tracker_id_uniq
  ON public.intelligence_trackers (user_id, tracker_id);

ALTER TABLE public.intelligence_trackers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_trackers'
      AND policyname = 'users_select_own_intelligence_trackers'
  ) THEN
    CREATE POLICY "users_select_own_intelligence_trackers"
      ON public.intelligence_trackers FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_trackers'
      AND policyname = 'users_insert_own_intelligence_trackers'
  ) THEN
    CREATE POLICY "users_insert_own_intelligence_trackers"
      ON public.intelligence_trackers FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_trackers'
      AND policyname = 'users_delete_own_intelligence_trackers'
  ) THEN
    CREATE POLICY "users_delete_own_intelligence_trackers"
      ON public.intelligence_trackers FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_trackers'
      AND policyname = 'service_role_all_intelligence_trackers'
  ) THEN
    CREATE POLICY "service_role_all_intelligence_trackers"
      ON public.intelligence_trackers FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Force PostgREST to reload schema cache (fixes PGRST205 right after migrations).
NOTIFY pgrst, 'reload schema';

