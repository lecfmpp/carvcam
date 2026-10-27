-- Simpler guard: only an admin (or the service role) can change a role; the id never changes.
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
     and not public.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- Custom Access Token Hook: adds the role (user_role claim) to the login token.
-- Enable it in Authentication > Hooks > Customize Access Token (JWT) Claims > public.custom_access_token_hook
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  user_role public.app_role;
begin
  select p.role into user_role from public.profiles p where p.id = (event ->> 'user_id')::uuid;
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role::text, 'customer')));
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on table public.profiles to supabase_auth_admin;

create policy "Auth server reads roles for the token"
  on public.profiles as permissive for select to supabase_auth_admin
  using (true);
