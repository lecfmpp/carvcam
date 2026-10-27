-- Billing: which Stripe customer belongs to which account, and what each account is entitled to.
-- Only the service role (Stripe webhook and checkout Edge Functions) writes here; users read their own row.

create table public.billing_customers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);
comment on table public.billing_customers is 'Stripe customer for each account. Written by Edge Functions only.';

create table public.entitlements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'school')),
  source text check (source in ('subscription', 'lifetime', 'school', 'manual')),
  status text,                          -- Stripe subscription status: trialing, active, past_due, canceled...
  stripe_subscription_id text unique,
  stripe_price_lookup_key text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  lifetime boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.entitlements is 'What each account can use. plan=pro unlocks Pro features while status is trialing/active/past_due, or forever when lifetime=true.';

-- Stripe event ids already processed, so a retried webhook is applied once.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
comment on table public.stripe_events is 'Processed Stripe webhook events (idempotency).';

-- True when the signed-in account (or the given one) has Pro right now.
create or replace function public.has_pro(uid uuid default auth.uid())
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid
      and e.plan in ('pro', 'school')
      and (e.lifetime or e.source = 'manual' or e.status in ('trialing', 'active', 'past_due'))
  );
$$;

alter table public.billing_customers enable row level security;
alter table public.entitlements enable row level security;
alter table public.stripe_events enable row level security;

create policy "Read own entitlement, admins read all"
  on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "Read own billing customer, admins read all"
  on public.billing_customers for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

revoke all on public.billing_customers, public.entitlements, public.stripe_events from anon, authenticated;
grant select on public.billing_customers, public.entitlements to authenticated;
revoke execute on function public.has_pro(uuid) from public, anon;
grant execute on function public.has_pro(uuid) to authenticated;

create trigger entitlements_touch
  before update on public.entitlements
  for each row execute function public.touch_updated_at();

-- Add the plan to the login token next to the role, so the app can unlock Pro without a round trip.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  uid uuid := (event ->> 'user_id')::uuid;
  user_role public.app_role;
  pro boolean;
begin
  select p.role into user_role from public.profiles p where p.id = uid;
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.plan in ('pro', 'school')
      and (e.lifetime or e.source = 'manual' or e.status in ('trialing', 'active', 'past_due'))
  ) into pro;
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role::text, 'customer')));
  claims := jsonb_set(claims, '{plan}', to_jsonb(case when pro then 'pro' else 'free' end));
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant select on public.entitlements to supabase_auth_admin;
create policy "Auth server reads entitlements for the token"
  on public.entitlements as permissive for select to supabase_auth_admin
  using (true);
