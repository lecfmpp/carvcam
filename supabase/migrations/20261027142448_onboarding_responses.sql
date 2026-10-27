-- Answers from the onboarding wizard shown after sign-up (one row per account).
-- Structured columns (not one jsonb blob) so the team can segment and chart them.
create table public.onboarding_responses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  project_types text[] not null default '{}',     -- e.g. v_carve_signs, 3d_relief, inlays, cabinetry
  project_types_other text,
  purpose text check (purpose in ('hobby', 'side_business', 'full_time_business', 'education')),
  sales_channels text[] not null default '{}',    -- e.g. etsy, local_markets, commissions, wholesale
  machine_brand text,
  machine_model text,
  work_area text,                                 -- free text, e.g. "30 x 48 in"
  spindle text,                                   -- router, spindle, laser module...
  design_software text[] not null default '{}',   -- CAD: drawing the part
  cam_software text[] not null default '{}',      -- CAM: toolpaths and G-code
  control_software text[] not null default '{}',  -- sender: running the job on the machine
  software_other text,
  expectations text[] not null default '{}',      -- what they expect CarvCAM to be
  wanted_features text,                           -- free text: features that would make their work better
  biggest_frustration text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.onboarding_responses is 'Onboarding wizard answers: what they carve, why, which machine, which software per workflow step, and what they want from CarvCAM.';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger onboarding_responses_touch
  before update on public.onboarding_responses
  for each row execute function public.touch_updated_at();

alter table public.onboarding_responses enable row level security;

create policy "Read own answers, admins read all"
  on public.onboarding_responses for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "Insert own answers"
  on public.onboarding_responses for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Update own answers"
  on public.onboarding_responses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.onboarding_responses from anon;
grant select, insert, update on public.onboarding_responses to authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
