-- Server-side version history for workflow spaces.
-- A trigger snapshots the previous state before every update/delete, independently of the client,
-- so a buggy client save can never permanently destroy a workflow.

create table if not exists public.workflow_space_versions (
  id bigserial primary key,
  space_id text not null,
  name text,
  state jsonb not null,
  node_count integer not null default 0,
  reason text not null,
  created_by uuid,
  source_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workflow_space_versions_space_created_idx
  on public.workflow_space_versions (space_id, created_at desc);

alter table public.workflow_space_versions enable row level security;
-- No policies: only the service role (API routes / dashboard) can read or restore versions.

create or replace function public.workflow_state_node_count(s jsonb)
returns integer
language sql
immutable
set search_path = public
as $$
  select coalesce(sum(jsonb_array_length(coalesce(p->'nodes', '[]'::jsonb))), 0)::integer
  from jsonb_array_elements(case when jsonb_typeof(s->'pages') = 'array' then s->'pages' else '[]'::jsonb end) p
$$;

create or replace function public.workflow_spaces_snapshot_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_nodes integer;
  new_nodes integer;
  last_at timestamptz;
  snap_reason text;
begin
  old_nodes := public.workflow_state_node_count(old.state);
  if old_nodes = 0 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    snap_reason := 'delete';
  else
    if new.state is not distinct from old.state then
      return new;
    end if;
    new_nodes := public.workflow_state_node_count(new.state);
    select max(created_at) into last_at from public.workflow_space_versions where space_id = old.id;
    if new_nodes < old_nodes then
      snap_reason := 'nodes_removed';
    elsif last_at is null or last_at < now() - interval '3 minutes' then
      snap_reason := 'periodic';
    else
      return new;
    end if;
  end if;

  insert into public.workflow_space_versions (space_id, name, state, node_count, reason, created_by, source_updated_at)
  values (old.id, old.name, old.state, old_nodes, snap_reason, old.created_by, old.updated_at);

  delete from public.workflow_space_versions v
  where v.space_id = old.id
    and v.id not in (
      select id from public.workflow_space_versions
      where space_id = old.id
      order by created_at desc
      limit 100
    );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.workflow_spaces_snapshot_version() from public, anon, authenticated;

drop trigger if exists workflow_spaces_snapshot_version on public.workflow_spaces;
create trigger workflow_spaces_snapshot_version
  before update or delete on public.workflow_spaces
  for each row execute function public.workflow_spaces_snapshot_version();
