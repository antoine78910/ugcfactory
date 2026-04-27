-- Cloud-persisted workflow spaces, so collaborators can actually see the
-- workflow content shared with them after accepting a `workflow_invite_tokens`
-- link. Until this migration, the workflow project state lived only in the
-- creator's localStorage and could not travel to invitees.

-- Note: `workflow_space_collaborators` and `workflow_invite_tokens` were
-- created out-of-band before; we re-declare them with `if not exists` so this
-- migration is idempotent on environments where they already live.

create table if not exists public.workflow_space_collaborators (
  id uuid primary key default gen_random_uuid(),
  space_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);

create index if not exists workflow_space_collaborators_user_idx
  on public.workflow_space_collaborators (user_id);
create index if not exists workflow_space_collaborators_space_idx
  on public.workflow_space_collaborators (space_id);

create table if not exists public.workflow_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  space_id text not null,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  permission text not null check (permission in ('editor', 'viewer')),
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists workflow_invite_tokens_space_idx
  on public.workflow_invite_tokens (space_id);

-- New: actual workflow project state, mirrored from the editor.
create table if not exists public.workflow_spaces (
  id text primary key,
  name text not null default 'Untitled workflow',
  state jsonb not null,
  preview_data_url text,
  published_community_template_id uuid,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_spaces_owner_idx
  on public.workflow_spaces (created_by);

-- API enforces all auth/access via service role. RLS stays enabled to deny
-- direct client access; reads/writes go through the route handlers which
-- check `workflow_space_collaborators` membership.
alter table public.workflow_spaces enable row level security;
alter table public.workflow_space_collaborators enable row level security;
alter table public.workflow_invite_tokens enable row level security;

-- Allow logged-in users to see their own collaborator rows (used to make the
-- shared list mostly work without service role lookups in some places).
drop policy if exists "workflow_space_collaborators_select_own"
  on public.workflow_space_collaborators;
create policy "workflow_space_collaborators_select_own"
on public.workflow_space_collaborators
for select
to authenticated
using (auth.uid() = user_id);

-- All other operations on these tables are mediated through service-role API
-- routes; no other policies are needed.
