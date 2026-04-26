alter table public.workflow_community_templates
  add column if not exists created_by_name text not null default '';

do $$
begin
  if to_regclass('public.profiles') is not null then
    update public.workflow_community_templates t
    set created_by_name = coalesce(
      nullif(trim(p.first_name), ''),
      nullif(split_part(p.email, '@', 1), ''),
      'User'
    )
    from public.profiles p
    where p.id = t.created_by
      and (t.created_by_name is null or trim(t.created_by_name) = '');
  end if;
end $$;
