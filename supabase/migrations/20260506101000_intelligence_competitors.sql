-- Intelligence competitors: per-user saved competitor list for /intelligence.

CREATE TABLE IF NOT EXISTS public.intelligence_competitors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lookup_id  TEXT,
  name       TEXT NOT NULL,
  domain     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_competitors_user_id_idx
  ON public.intelligence_competitors (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_competitors_user_lookup_id_uniq
  ON public.intelligence_competitors (user_id, lookup_id)
  WHERE lookup_id IS NOT NULL;

ALTER TABLE public.intelligence_competitors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_competitors'
      AND policyname = 'users_select_own_intelligence_competitors'
  ) THEN
    CREATE POLICY "users_select_own_intelligence_competitors"
      ON public.intelligence_competitors FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_competitors'
      AND policyname = 'users_insert_own_intelligence_competitors'
  ) THEN
    CREATE POLICY "users_insert_own_intelligence_competitors"
      ON public.intelligence_competitors FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_competitors'
      AND policyname = 'users_delete_own_intelligence_competitors'
  ) THEN
    CREATE POLICY "users_delete_own_intelligence_competitors"
      ON public.intelligence_competitors FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_competitors'
      AND policyname = 'service_role_all_intelligence_competitors'
  ) THEN
    CREATE POLICY "service_role_all_intelligence_competitors"
      ON public.intelligence_competitors FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Force PostgREST to reload schema cache (fixes PGRST205 right after migrations).
NOTIFY pgrst, 'reload schema';

