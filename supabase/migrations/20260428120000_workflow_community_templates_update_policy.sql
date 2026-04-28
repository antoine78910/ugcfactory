-- The original `workflow_community_templates` migration only created
-- SELECT / INSERT / DELETE RLS policies. Without an UPDATE policy, every
-- "Push modifications" call from the workflow editor (`POST` with templateId)
-- is silently rejected by Postgres RLS, so `.update(...).select().maybeSingle()`
-- returns no row and the API replies with "Template not found or not owned
-- by your account.".
--
-- This migration adds the missing UPDATE policy so authors can refresh their
-- own published templates, and refreshes the schema cache so PostgREST sees
-- the latest columns immediately.

drop policy if exists "workflow_community_templates_update_own"
  on public.workflow_community_templates;
create policy "workflow_community_templates_update_own"
on public.workflow_community_templates
for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

-- Touch the table so PostgREST picks up the latest column set right away
-- (older deploys missing `updated_at` / `created_by_name` would otherwise
-- only refresh on the next schema reload).
notify pgrst, 'reload schema';
