-- Migration: workflow space sharing & collaboration
--
-- workflow_space_collaborators: tracks who has access to each space (owner, editor, viewer)
-- workflow_invite_tokens: shareable invite links with permission level & optional expiry

-- ---------------------------------------------------------------------------
-- workflow_space_collaborators
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_space_collaborators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    text NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS wsc_space_id_idx ON public.workflow_space_collaborators (space_id);
CREATE INDEX IF NOT EXISTS wsc_user_id_idx  ON public.workflow_space_collaborators (user_id);

ALTER TABLE public.workflow_space_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wsc_select_member" ON public.workflow_space_collaborators;
CREATE POLICY "wsc_select_member"
  ON public.workflow_space_collaborators FOR SELECT
  USING (
    space_id IN (
      SELECT space_id FROM public.workflow_space_collaborators WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wsc_insert_owner" ON public.workflow_space_collaborators;
CREATE POLICY "wsc_insert_owner"
  ON public.workflow_space_collaborators FOR INSERT
  WITH CHECK (
    space_id IN (
      SELECT space_id FROM public.workflow_space_collaborators WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "wsc_update_owner" ON public.workflow_space_collaborators;
CREATE POLICY "wsc_update_owner"
  ON public.workflow_space_collaborators FOR UPDATE
  USING (
    space_id IN (
      SELECT space_id FROM public.workflow_space_collaborators WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "wsc_delete_owner" ON public.workflow_space_collaborators;
CREATE POLICY "wsc_delete_owner"
  ON public.workflow_space_collaborators FOR DELETE
  USING (
    space_id IN (
      SELECT space_id FROM public.workflow_space_collaborators WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE TRIGGER wsc_set_updated_at
BEFORE UPDATE ON public.workflow_space_collaborators
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workflow_invite_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_invite_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    text NOT NULL,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  permission  text NOT NULL CHECK (permission IN ('viewer', 'editor')) DEFAULT 'viewer',
  expires_at  timestamptz,
  max_uses    integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count  integer NOT NULL DEFAULT 0,
  revoked     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wit_space_id_idx ON public.workflow_invite_tokens (space_id);
CREATE INDEX IF NOT EXISTS wit_token_idx    ON public.workflow_invite_tokens (token);

ALTER TABLE public.workflow_invite_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wit_select_owner" ON public.workflow_invite_tokens;
CREATE POLICY "wit_select_owner"
  ON public.workflow_invite_tokens FOR SELECT
  USING (
    space_id IN (
      SELECT space_id FROM public.workflow_space_collaborators WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "wit_insert_owner" ON public.workflow_invite_tokens;
CREATE POLICY "wit_insert_owner"
  ON public.workflow_invite_tokens FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND space_id IN (
      SELECT space_id FROM public.workflow_space_collaborators WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "wit_update_owner" ON public.workflow_invite_tokens;
CREATE POLICY "wit_update_owner"
  ON public.workflow_invite_tokens FOR UPDATE
  USING (
    space_id IN (
      SELECT space_id FROM public.workflow_space_collaborators WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
