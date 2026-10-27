-- CarvCAM roles: admin (team) and customer (clients). Every new account starts as customer;
-- e-mails listed in admin_allowlist start as admin.

create type public.app_role as enum ('admin', 'customer');

-- One profile per account (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per account. role: admin (CarvCAM team) or customer.';
create index profiles_role_idx on public.profiles (role);

-- E-mails that sign up as admin. Database-only (no API access).
create table public.admin_allowlist (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
comment on table public.admin_allowlist is 'Accounts created with these e-mails get the admin role.';
insert into public.admin_allowlist (email) values ('lecfmpp@gmail.com');

-- Is the signed-in user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

-- New auth.users row -> profile (admin if the e-mail is allowlisted)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case
      when exists (select 1 from public.admin_allowlist a where a.email = lower(new.email)) then 'admin'::public.app_role
      else 'customer'::public.app_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- E-mail changed in auth.users -> keep the profile in sync
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email), updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Only an admin can change a role; nobody can promote themselves
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.email is distinct from old.email and coalesce(auth.role(), '') not in ('service_role', '') then
    -- e-mail comes from auth.users (trigger above); id never changes
    if new.id is distinct from old.id then
      raise exception 'Profile id cannot change' using errcode = '42501';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- RLS
alter table public.profiles enable row level security;
alter table public.admin_allowlist enable row level security;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Admins read all profiles"
  on public.profiles for select to authenticated
  using ((select public.is_admin()));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Admins update any profile"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Customers may only edit their name; everything else belongs to the database and admins (role, via the trigger above)
revoke all on public.profiles from anon;
revoke insert, delete, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, role) on public.profiles to authenticated;
revoke all on public.admin_allowlist from anon, authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_admin() from anon, public;
