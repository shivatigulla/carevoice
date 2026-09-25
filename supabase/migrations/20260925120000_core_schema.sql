-- CareVoice core schema (Phase 2)
--
-- Conventions (docs/ARCHITECTURE.md):
--   * UUID primary keys; created_at / updated_at (trigger-maintained) on every table; timestamptz = UTC.
--   * Every table has tenant_id and RLS. Staff READ rows of their own tenant (current_tenant_id()).
--     There are no end-user write policies: writes go through the FastAPI backend, which connects as
--     the table owner.
--   * Short-lived state (slot holds, call-session verification) uses expiry columns, not Redis.

create extension if not exists pgcrypto with schema extensions;

-- ===========================================================================
-- Helpers
-- ===========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
-- Tenants & staff
-- ===========================================================================

create table public.tenants (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid generated always as (id) stored,  -- keeps "every table has tenant_id" uniform
  name                   text not null,
  slug                   text not null unique,
  city                   text,
  timezone               text not null default 'Asia/Kolkata',
  calling_window_start   time not null default '09:00',
  calling_window_end     time not null default '20:00',
  languages              text[] not null default array['te', 'hi', 'en'],
  on_duty_phone          text,
  -- {"te": "...", "hi": "...", "en": "..."}: first line of every call
  recording_disclosure   jsonb not null default '{}'::jsonb,
  -- cancellation_cutoff_hours, emergency_keywords, caring_checklist, pronunciation_dict, ...
  settings               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'reception' check (role in ('admin', 'reception', 'doctor', 'viewer')),
  full_name   text,
  email       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index staff_user_idx on public.staff (user_id);

-- The logged-in staff member's tenant. SECURITY DEFINER so policies can call it without recursing
-- into staff's own RLS policy.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.tenant_id from public.staff s
   where s.user_id = auth.uid() and s.is_active
   order by s.created_at
   limit 1;
$$;

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.staff s
   where s.user_id = auth.uid() and s.is_active
   order by s.created_at
   limit 1;
$$;

revoke all on function public.current_tenant_id() from public;
revoke all on function public.current_staff_role() from public;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.current_staff_role() to authenticated;

-- ===========================================================================
-- Directory: departments, doctors, patients
-- ===========================================================================

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  name_te     text,
  name_hi     text,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.doctors (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  department_id     uuid not null references public.departments(id) on delete restrict,
  name              text not null,
  name_te           text,
  name_hi           text,
  qualification     text,
  languages_spoken  text[] not null default array['te', 'en'],
  fee               numeric(10, 2),
  -- {"mon": {"start": "09:00", "end": "17:00", "lunch_start": "13:00", "lunch_end": "14:00"}, "sun": null, ...}
  schedule          jsonb not null default '{}'::jsonb,
  slot_minutes      integer not null default 15 check (slot_minutes between 5 and 120),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, name)
);
create index doctors_department_idx on public.doctors (department_id);

create table public.patients (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  mrn                 text,
  name                text not null,
  phone               text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),  -- E.164
  dob                 date,
  gender              text check (gender in ('female', 'male', 'other')),
  preferred_language  text not null default 'te' check (preferred_language in ('te', 'hi', 'en')),
  caregiver_name      text,
  caregiver_phone     text check (caregiver_phone is null or caregiver_phone ~ '^\+[1-9][0-9]{7,14}$'),
  opt_out             boolean not null default false,
  dnd                 boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Families often share a phone, so phone is indexed, not unique.
create index patients_tenant_phone_idx on public.patients (tenant_id, phone);
create unique index patients_tenant_mrn_key on public.patients (tenant_id, mrn) where mrn is not null;

-- ===========================================================================
-- Scheduling
-- ===========================================================================

create table public.appointment_slots (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  doctor_id        uuid not null references public.doctors(id) on delete cascade,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text not null default 'open' check (status in ('open', 'held', 'booked', 'blocked')),
  held_by_session  uuid,          -- call_sessions.id (FK added below)
  held_until       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (doctor_id, starts_at),
  check (ends_at > starts_at),
  check ((status = 'held') = (held_until is not null))
);
create index appointment_slots_lookup_idx on public.appointment_slots (tenant_id, doctor_id, starts_at);
create index appointment_slots_held_idx on public.appointment_slots (held_until) where status = 'held';

-- ===========================================================================
-- Agents & calls
-- ===========================================================================

create table public.agents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  type          text not null check (type in ('reception', 'appointment', 'follow_up', 'pre_visit', 'caring', 'console')),
  display_name  text not null,
  enabled       boolean not null default true,
  -- {"description", "prompt", "allowed_tools": [...], "flow": {...}, "voice": {...}}
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, type)
);

create table public.workflow_rules (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  name             text not null,
  event_type       text not null,
  conditions       jsonb not null default '{}'::jsonb,
  agent_type       text not null,
  purpose          text not null,
  delay_minutes    integer,
  at_time          time,           -- e.g. 17:00 IST the day before
  max_attempts     integer not null default 3,
  retry_intervals  integer[] not null default array[30, 120],  -- minutes
  enabled          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.domain_events (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  event_type       text not null,
  entity_type      text,
  entity_id        uuid,
  payload          jsonb not null default '{}'::jsonb,
  idempotency_key  text not null,
  occurred_at      timestamptz not null default now(),
  processed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index domain_events_unprocessed_idx on public.domain_events (occurred_at) where processed_at is null;

create table public.call_tasks (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  patient_id        uuid not null references public.patients(id) on delete cascade,
  agent_type        text not null,
  purpose           text not null,
  status            text not null default 'scheduled'
                      check (status in ('scheduled', 'dialing', 'in_progress', 'completed', 'failed', 'cancelled')),
  scheduled_for     timestamptz not null,
  attempts          integer not null default 0,
  max_attempts      integer not null default 3,
  next_attempt_at   timestamptz,
  last_call_id      uuid,          -- calls.id (FK added below)
  workflow_rule_id  uuid references public.workflow_rules(id) on delete set null,
  domain_event_id   uuid references public.domain_events(id) on delete set null,
  appointment_id    uuid,          -- appointments.id (FK added below)
  context_snapshot  jsonb not null default '{}'::jsonb,
  result            jsonb,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index call_tasks_due_idx on public.call_tasks (tenant_id, status, scheduled_for);

create table public.calls (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  direction         text not null check (direction in ('inbound', 'outbound')),
  channel           text not null default 'phone' check (channel in ('phone', 'web')),
  provider          text,
  provider_call_id  text,
  patient_id        uuid references public.patients(id) on delete set null,
  task_id           uuid references public.call_tasks(id) on delete set null,
  from_number       text,
  to_number         text,
  agent_type        text,
  status            text not null default 'live' check (status in ('live', 'completed', 'failed', 'no_answer')),
  languages         text[] not null default '{}',
  intent            text,
  outcome           text,
  current_stage     text,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  duration_sec      integer,
  recording_path    text,
  summary           jsonb,
  cost_breakdown    jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index calls_tenant_status_idx on public.calls (tenant_id, status);
create index calls_tenant_started_idx on public.calls (tenant_id, started_at desc);
create index calls_patient_idx on public.calls (patient_id);
create unique index calls_provider_call_key on public.calls (provider, provider_call_id) where provider_call_id is not null;

alter table public.call_tasks
  add constraint call_tasks_last_call_fk foreign key (last_call_id) references public.calls(id) on delete set null;

create table public.call_sessions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  call_id              uuid not null references public.calls(id) on delete cascade,
  verified_patient_id  uuid references public.patients(id) on delete set null,
  verified_at          timestamptz,
  verification_attempts integer not null default 0,
  expires_at           timestamptz not null default now() + interval '30 minutes',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index call_sessions_call_idx on public.call_sessions (call_id);

alter table public.appointment_slots
  add constraint appointment_slots_session_fk foreign key (held_by_session) references public.call_sessions(id) on delete set null;

create table public.appointments (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  patient_id            uuid not null references public.patients(id) on delete cascade,
  doctor_id             uuid not null references public.doctors(id) on delete restrict,
  slot_id               uuid not null references public.appointment_slots(id) on delete restrict,
  starts_at             timestamptz not null,   -- denormalised from the slot for fast day views
  status                text not null default 'booked'
                          check (status in ('booked', 'confirmed', 'rescheduled', 'cancelled', 'checked_in', 'no_show', 'completed')),
  source                text not null default 'staff' check (source in ('voice', 'staff', 'console', 'import', 'seed')),
  reason                text,
  call_id               uuid references public.calls(id) on delete set null,
  rescheduled_from_id   uuid references public.appointments(id) on delete set null,
  cancelled_reason      text,
  checked_in_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- A slot has at most one active appointment. 'rescheduled' = the old appointment that was moved.
create unique index appointments_one_active_per_slot
  on public.appointments (slot_id)
  where status not in ('cancelled', 'rescheduled');
create index appointments_tenant_starts_idx on public.appointments (tenant_id, starts_at);
create index appointments_patient_idx on public.appointments (patient_id, starts_at);
create index appointments_doctor_idx on public.appointments (doctor_id, starts_at);

alter table public.call_tasks
  add constraint call_tasks_appointment_fk foreign key (appointment_id) references public.appointments(id) on delete set null;

create table public.call_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  call_id     uuid not null references public.calls(id) on delete cascade,
  type        text not null,   -- stage_change, tool_call, action, handoff, escalation, system, ...
  label       text not null,
  payload     jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index call_events_call_idx on public.call_events (call_id, at);

create table public.call_transcripts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  call_id     uuid not null references public.calls(id) on delete cascade,
  speaker     text not null check (speaker in ('patient', 'agent', 'staff', 'system')),
  text        text not null,
  language    text check (language in ('te', 'hi', 'en')),
  start_ms    integer,
  end_ms      integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index call_transcripts_call_idx on public.call_transcripts (call_id, start_ms);

create table public.call_metrics (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  call_id         uuid not null references public.calls(id) on delete cascade,
  turn_index      integer not null,
  stt_ms          integer,
  llm_ttfb_ms     integer,
  llm_total_ms    integer,
  tts_ttfb_ms     integer,
  e2e_ms          integer,
  tokens_in       integer,
  tokens_out      integer,
  tts_chars       integer,
  stt_seconds     numeric(10, 2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index call_metrics_call_idx on public.call_metrics (call_id, turn_index);

-- ===========================================================================
-- Escalations, actions, audit
-- ===========================================================================

create table public.escalations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  call_id             uuid references public.calls(id) on delete set null,
  patient_id          uuid references public.patients(id) on delete set null,
  priority            text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  category            text not null default 'other'
                        check (category in ('emergency', 'clinical_concern', 'human_request', 'frustration', 'billing', 'other')),
  reason              text not null,
  summary             text,
  transcript_excerpt  text,
  status              text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  sla_due_at          timestamptz,
  taken_by            uuid references auth.users(id) on delete set null,
  taken_at            timestamptz,
  resolved_by         uuid references auth.users(id) on delete set null,
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index escalations_queue_idx on public.escalations (tenant_id, status, priority, created_at desc);

create table public.agent_actions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  call_id      uuid references public.calls(id) on delete cascade,
  agent_type   text not null,
  tool_name    text not null,
  arguments    jsonb not null default '{}'::jsonb,
  decision     text not null check (decision in ('allowed', 'denied', 'error')),
  error_code   text,
  result       jsonb,
  latency_ms   integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index agent_actions_call_idx on public.agent_actions (call_id, created_at);

create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  actor_type   text not null check (actor_type in ('agent', 'staff', 'system')),
  actor_id     text,
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  at           timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index audit_logs_tenant_at_idx on public.audit_logs (tenant_id, at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- ===========================================================================
-- Knowledge, discharges, evals
-- ===========================================================================

create table public.knowledge_articles (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  type           text not null check (type in ('prep_instruction', 'document_checklist', 'arrival_info', 'hospital_faq')),
  scope          text not null default 'global' check (scope in ('global', 'department', 'doctor', 'procedure')),
  department_id  uuid references public.departments(id) on delete cascade,
  doctor_id      uuid references public.doctors(id) on delete cascade,
  procedure      text,
  title          text not null,
  content        jsonb not null default '{}'::jsonb,   -- {"te": "...", "hi": "...", "en": "..."}
  status         text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  version        integer not null default 1,
  parent_id      uuid references public.knowledge_articles(id) on delete set null,
  approved_by    uuid references auth.users(id) on delete set null,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index knowledge_articles_lookup_idx on public.knowledge_articles (tenant_id, type, status);

create table public.discharges (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  department_id   uuid references public.departments(id) on delete set null,
  doctor_id       uuid references public.doctors(id) on delete set null,
  discharged_at   timestamptz not null,
  notes           text,
  checklist_results jsonb,
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index discharges_patient_idx on public.discharges (patient_id, discharged_at desc);

create table public.eval_runs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  status           text not null default 'running' check (status in ('running', 'passed', 'failed', 'error')),
  scenarios_total  integer not null default 0,
  scenarios_passed integer not null default 0,
  report           jsonb,
  report_path      text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ===========================================================================
-- Generic background jobs (worker, SELECT ... FOR UPDATE SKIP LOCKED)
-- ===========================================================================

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

-- ===========================================================================
-- updated_at triggers + RLS + tenant read policies on every table
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'staff', 'departments', 'doctors', 'patients', 'appointment_slots', 'agents',
    'workflow_rules', 'domain_events', 'call_tasks', 'calls', 'call_sessions', 'appointments',
    'call_events', 'call_transcripts', 'call_metrics', 'escalations', 'agent_actions', 'audit_logs',
    'knowledge_articles', 'discharges', 'eval_runs', 'jobs'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "staff read own tenant" on public.%I for select to authenticated using (tenant_id = (select public.current_tenant_id()))', t);
  end loop;
end;
$$;

-- Internal plumbing is never read from the browser.
drop policy "staff read own tenant" on public.jobs;
drop policy "staff read own tenant" on public.call_sessions;

-- ===========================================================================
-- Realtime (RLS applies to postgres_changes too)
-- ===========================================================================

alter publication supabase_realtime add table
  public.calls, public.call_transcripts, public.call_events, public.escalations, public.call_tasks, public.appointments;

-- ===========================================================================
-- Storage: private recordings bucket, {tenant_id}/{yyyy}/{mm}/{call_id}.mp3, served via signed URLs
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;
