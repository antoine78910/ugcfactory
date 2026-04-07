-- Add first_name to profiles (email/password signup sends it via auth.users.raw_user_meta_data).
-- Run in Supabase SQL Editor after profiles exist.

alter table public.profiles add column if not exists first_name text not null default '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn text;
begin
  fn := coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), '');
  insert into public.profiles (id, email, first_name)
  values (new.id, coalesce(new.email, ''), fn)
  on conflict (id) do update
    set email = excluded.email,
        first_name = case
          when excluded.first_name <> '' then excluded.first_name
          else public.profiles.first_name
        end;
  return new;
end;
$$;
