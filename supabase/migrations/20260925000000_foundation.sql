-- CareVoice foundation schema
--
-- Rules (see docs/ARCHITECTURE.md):
--   * UUID primary keys, created_at / updated_at on every table, timestamps stored as timestamptz (UTC).
--   * Every table carries tenant_id and has RLS enabled. Authenticated users can only READ rows of
--     tenants they are a member of. There are no write policies for end users: all important writes go
--     through the FastAPI backend, which connects as the table owner (bypasses RLS).
--   * No Redis: short-lived state and background jobs live in Postgres (see `jobs`).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenants (hospitals) and membership
-- ---------------------------------------------------------------------------

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  -- A tenant row is its own tenant; kept so the "every table has tenant_id" rule holds uniformly.
  tenant_id   uuid generated always as (id) stored,
  name        text not null,
  slug        text not null unique,
  timezone    text not null default 'Asia/Kolkata',
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.tenant_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'staff' check (role in ('admin', 'staff', 'viewer')),
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id);

-- Tenants the current auth user belongs to. SECURITY DEFINER so RLS policies can call it without
-- recursing into tenant_members' own policy.
create or replace function public.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.tenant_id from public.tenant_members tm where tm.user_id = auth.uid();
$$;
revoke all on function public.user_tenant_ids() from public;
grant execute on function public.user_tenant_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Agents: configurations (prompt + allowed tools + flow), not separate bots.
-- ---------------------------------------------------------------------------

create table public.agents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  key             text not null check (key in ('reception', 'appointment', 'follow_up', 'pre_visit', 'caring', 'console')),
  name            text not null,
  description     text,
  status          text not null default 'active' check (status in ('active', 'paused', 'draft')),
  languages       text[] not null default array['te', 'hi', 'en'],
  system_prompt   text not null default '',
  allowed_tools   text[] not null default '{}',
  flow            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, key)
);

-- ---------------------------------------------------------------------------
-- Clinical directory
-- ---------------------------------------------------------------------------

create table public.patients (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  full_name           text not null,
  phone               text not null,
  preferred_language  text not null default 'te' check (preferred_language in ('te', 'hi', 'en')),
  date_of_birth       date,
  gender              text,
  mrn                 text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, phone)
);

create table public.doctors (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  full_name    text not null,
  department   text not null,
  languages    text[] not null default array['te', 'hi', 'en'],
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Calls
-- ---------------------------------------------------------------------------

create table public.calls (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  agent_id           uuid references public.agents(id) on delete set null,
  patient_id         uuid references public.patients(id) on delete set null,
  direction          text not null check (direction in ('inbound', 'outbound')),
  status             text not null default 'queued'
                       check (status in ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'busy', 'transferred')),
  from_number        text,
  to_number          text,
  language           text check (language in ('te', 'hi', 'en')),
  provider           text,
  provider_call_id   text,
  started_at         timestamptz,
  answered_at        timestamptz,
  ended_at           timestamptz,
  duration_seconds   integer,
  summary            text,
  recording_path     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index calls_tenant_status_idx on public.calls (tenant_id, status);
create index calls_tenant_created_idx on public.calls (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Appointments, follow-ups, tasks, escalations
-- ---------------------------------------------------------------------------

create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  doctor_id        uuid references public.doctors(id) on delete set null,
  department       text,
  scheduled_at     timestamptz not null,
  duration_minutes integer not null default 15,
  status           text not null default 'booked'
                     check (status in ('booked', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show')),
  source_call_id   uuid references public.calls(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index appointments_tenant_scheduled_idx on public.appointments (tenant_id, scheduled_at);

create table public.follow_ups (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  appointment_id  uuid references public.appointments(id) on delete set null,
  agent_id        uuid references public.agents(id) on delete set null,
  reason          text not null,
  due_at          timestamptz not null,
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'in_progress', 'completed', 'failed', 'cancelled')),
  attempts        integer not null default 0,
  last_call_id    uuid references public.calls(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index follow_ups_tenant_due_idx on public.follow_ups (tenant_id, status, due_at);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  title        text not null,
  description  text,
  status       text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to  uuid references auth.users(id) on delete set null,
  call_id      uuid references public.calls(id) on delete set null,
  patient_id   uuid references public.patients(id) on delete set null,
  due_at       timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_tenant_status_idx on public.tasks (tenant_id, status);

create table public.escalations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  call_id           uuid references public.calls(id) on delete set null,
  patient_id        uuid references public.patients(id) on delete set null,
  severity          text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  reason            text not null,
  status            text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by   uuid references auth.users(id) on delete set null,
  acknowledged_at   timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index escalations_tenant_status_idx on public.escalations (tenant_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Background jobs (claimed by the worker with SELECT ... FOR UPDATE SKIP LOCKED)
-- ---------------------------------------------------------------------------

create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  kind          text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  run_at        timestamptz not null default now(),
  attempts      integer not null default 0,
  max_attempts  integer not null default 3,
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index jobs_due_idx on public.jobs (run_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- updated_at triggers, RLS, read policies
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'tenant_members', 'agents', 'patients', 'doctors', 'calls',
    'appointments', 'follow_ups', 'tasks', 'escalations', 'jobs'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "tenant members can read" on public.%I for select to authenticated using (tenant_id in (select public.user_tenant_ids()))', t);
  end loop;
end;
$$;

-- Jobs are internal plumbing; staff never read them from the browser.
drop policy "tenant members can read" on public.jobs;

-- ---------------------------------------------------------------------------
-- Realtime: the dashboard subscribes to these tables (RLS still applies).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.calls, public.escalations, public.agents, public.appointments, public.follow_ups, public.tasks;
