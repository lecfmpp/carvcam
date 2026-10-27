-- Move is_admin() out of the API-exposed schema so it can't be called via /rest/v1/rpc,
-- and merge the per-action RLS policies into one each (advisor: multiple permissive policies).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- The guard calls the function by name, so point it at the new schema.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profile id cannot change' using errcode = '42501';
  end if;
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and not private.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop policy "Users read their own profile" on public.profiles;
drop policy "Admins read all profiles" on public.profiles;
drop policy "Users update their own profile" on public.profiles;
drop policy "Admins update any profile" on public.profiles;

create policy "Read own profile, admins read all"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()));

create policy "Update own profile, admins update all"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()))
  with check ((select auth.uid()) = id or (select private.is_admin()));

-- admin_allowlist is intentionally unreachable from the API: RLS on, no policies, no grants.
comment on table public.admin_allowlist is 'Accounts created with these e-mails get the admin role. Database-only: RLS on with no policies by design.';
