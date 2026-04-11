-- -----------------------------------------------------------------------------
-- Auth user delete: find & fix public FKs to auth.users that block dashboard delete
-- -----------------------------------------------------------------------------
-- Symptom: Supabase Auth → "Failed to delete selected users: Database error deleting user"
-- Cause: a row in public.* still references auth.users(id) with ON DELETE NO ACTION / RESTRICT.
--
-- 1) Run the SELECT below in SQL Editor and look for delete_rule ≠ CASCADE.
-- 2) If any rows appear, run the DO block (section 2). It only touches schema public.
-- -----------------------------------------------------------------------------

-- === 1) AUDIT: all foreign keys TO auth.users (any schema) ===================
SELECT
  n.nspname AS schema_name,
  c.conrelid::regclass AS table_name,
  c.conname AS constraint_name,
  CASE c.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE c.confdeltype::text
  END AS on_delete_rule,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE c.confrelid = 'auth.users'::regclass
  AND c.contype = 'f'
ORDER BY n.nspname, c.conrelid::regclass::text;

-- Rows where on_delete_rule is not CASCADE are what block Auth user deletion.


-- === 2) FIX: recreate public FKs to auth.users with ON DELETE CASCADE =========
-- Safe for this app: every public.user_id / profiles.id → auth.users is owned data.
-- Skip if you intentionally used SET NULL somewhere.

DO $fix$
DECLARE
  r RECORD;
  cols text;
BEGIN
  FOR r IN
    SELECT c.oid, c.conname, n.nspname, cl.relname
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.confrelid = 'auth.users'::regclass
      AND c.contype = 'f'
      AND c.confdeltype IS DISTINCT FROM 'c'::"char"
      AND n.nspname = 'public'
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY x.ord)
    INTO cols
    FROM pg_constraint c2
    CROSS JOIN LATERAL unnest(c2.conkey) WITH ORDINALITY AS x(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = c2.conrelid AND a.attnum = x.attnum AND NOT a.attisdropped
    WHERE c2.oid = r.oid;

    IF cols IS NULL OR position(',' IN cols) > 0 THEN
      RAISE NOTICE 'Skipping % (multi-column or unresolved FK): %', r.conname, r.relname;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.nspname,
      r.relname,
      r.conname
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES auth.users(id) ON DELETE CASCADE',
      r.nspname,
      r.relname,
      r.conname,
      cols
    );
    RAISE NOTICE 'Updated % on %.% to ON DELETE CASCADE', r.conname, r.nspname, r.relname;
  END LOOP;
END;
$fix$;
