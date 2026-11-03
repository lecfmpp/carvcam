-- Sign in the desktop / panel app with a CarvCAM account (device code flow).
--
-- 1. The app asks the app-auth Edge Function for a code ("start") and shows it, e.g. KXTB-9RWM.
-- 2. The person opens carvcam.com/activate/, logs in and approves that code.
-- 3. The app, polling with its secret device_code, receives a long-lived device token.
-- 4. With that token the app fetches a signed license (plan + expiry) it can check offline.
--
-- Both tables are written only by the Edge Function (service role). People can see and remove
-- their own signed-in devices from the account page.

create table public.app_login_requests (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique,
  user_code text not null unique check (user_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  device_name text,
  platform text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  user_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
comment on table public.app_login_requests is
  'Pending app sign-ins (device code flow). Short-lived; written by the app-auth Edge Function only. RLS on with no policies by design.';
alter table public.app_login_requests enable row level security;
revoke all on public.app_login_requests from anon, authenticated;

create table public.app_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  name text not null default 'CarvCAM',
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
comment on table public.app_devices is
  'Computers signed in to the CarvCAM app. token_hash is the SHA-256 of the device token; the token itself is never stored.';
create index app_devices_user_id_idx on public.app_devices (user_id);
alter table public.app_devices enable row level security;

create policy "Own devices: read" on public.app_devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Own devices: sign out" on public.app_devices
  for delete to authenticated using (user_id = (select auth.uid()));

-- The token hash never leaves the server, not even to its owner.
revoke all on public.app_devices from anon, authenticated;
grant select (id, user_id, name, platform, created_at, last_seen_at) on public.app_devices to authenticated;
grant delete on public.app_devices to authenticated;
