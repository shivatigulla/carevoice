# CareVoice — Build Progress

Work proceeds phase by phase, in order. Each phase ends with: run → test (browser for UI, pytest for
backend) → fix → `git commit -m "phase N: <name>"`.

**Resuming work:** read this file and [`ARCHITECTURE.md`](ARCHITECTURE.md), then continue with the
first phase that is not `done`.

| #  | Phase                                        | Status  |
|----|----------------------------------------------|---------|
| 1  | Foundation                                   | done    |
| 2  | Database, auth, seed, data pages             | done    |
| 3  | Tools + Policy Engine                        | partial (fast track) |
| 4  | Voice core + browser Test Call               | partial (fast track) |
| 5  | Real phone calls                             | todo    |
| 6  | Reception → Appointment agent (Pipecat Flows)| todo    |
| 7  | Call intelligence                            | todo    |
| 8  | Live dashboard (showpiece) — MVP             | todo    |
| 9  | Escalation + emergency + human transfer      | todo    |
| 10 | Workflow engine                              | todo    |
| 11 | Outbound dialer + Follow-Up agent            | todo    |
| 12 | Knowledge base + Pre-Visit agent             | todo    |
| 13 | Caring / Post-Discharge agent                | todo    |
| 14 | Console Agent (for staff)                    | todo    |
| 15 | Analytics, agent health, cost                | todo    |
| 16 | Eval harness                                 | todo    |
| 17 | Roles, multi-hospital, settings, import, security | todo |
| 18 | Demo, polish, hosting                        | todo    |

---

## Phase 1 — Foundation · done

**Delivered**
- Monorepo: `backend/` (FastAPI + `worker.py` with APScheduler), `voice/` (placeholder FastAPI app,
  pipecat installed), `frontend/` (React/Vite/Tailwind v4/shadcn), `supabase/` (CLI project),
  `docs/`, `scripts/` (cross-platform venv runner + setup).
- Root scripts: `setup`, `dev`, `dev:backend|voice|worker|frontend`, `build`, `test`, `db:link`,
  `db:push`, `db:seed`, `demo:reset` (stub → Phase 18), `eval` (stub → Phase 16).
- Env: `backend/.env.example`, `voice/.env.example` (incl. `SUPABASE_JWT_SECRET`, `PRICE_*` INR
  cost table), `frontend/.env.example`.
- Backend `/health` (database, Storage, OpenAI key, Sarvam key) → topbar status pill with
  per-check dropdown. Always returns 200; the verdict is in the body.
- Postgres job queue (`SELECT … FOR UPDATE SKIP LOCKED`, retry with backoff, stale-job release)
  driven by the worker; provider interfaces (telephony Exotel/Twilio, Sarvam speech, OpenAI LLM);
  policy-engine skeleton.
- Design system (tokens, fonts, dark mode) and signature components: AgentAvatar, LiveWaveform,
  LanguageChip, StatusPill, KpiCard, TimelineItem, EmptyState/ErrorState, SkeletonCard,
  ToolCallCard (indigo), ActionCard (mint), ConfirmationCard.
- App shell: collapsible sidebar with live-calls badge, mobile drawer, topbar (hospital name, IST
  clock, status pill, Cmd/Ctrl+K palette, Ask CareVoice + Test Call (disabled until Phases 14/4),
  theme toggle, user menu), login page, protected routes with a "setup mode" when Supabase keys are
  absent.
- Dashboard layout (KPI row, AI Workforce, Live Calls, Escalations) reading via supabase-js +
  Realtime, with loading/empty/error states. All other pages: header + EmptyState.
- Dev-only `/design` route: component gallery for visual QA (excluded from production builds).

**Tests**: `npm test` — 15 pytest tests (config, `/health`, policy engine, provider selection).
Browser: every page at 1440 and 1024 px in light and dark.

**Notes carried into Phase 2** (resolved there): draft migration replaced, dashboard hooks and models
updated, JWT verification added.

---

## Phase 2 — Database, auth, seed, data pages · done

**Delivered**
- Migration `20260925120000_core_schema.sql` (pushed to the linked project): 23 tables, all with
  `tenant_id`, UUID PKs, `created_at`/`updated_at` triggers and RLS via `current_tenant_id()`;
  FKs and indexes; partial unique index = one active appointment per slot; Realtime publication for
  calls, call_transcripts, call_events, escalations, call_tasks, appointments; private `recordings`
  bucket.
- Backend: models for every table; staff auth (`app/api/auth.py`, JWKS ES256 + HS256 fallback,
  `require_roles`); `POST /api/appointments/{id}/check-in` (admin/reception, today only, audited);
  phone normalisation (E.164); reusable slot generator (`app/services/slots.py`); audit helper.
- Idempotent seed (`npm run db:seed`): Sunrise Multispeciality Hospital (Hyderabad, 09:00–20:00),
  settings (cancellation cutoff, emergency keywords te/hi/en/romanised, caring checklist,
  pronunciation dict, recording disclosure te/hi/en), demo admin, 7 departments, 10 doctors with
  Telugu/Devanagari names and schedules, 14-day slots, 30 patients (#1 = SEED_TEST_PHONE),
  upcoming appointments, 6 agents with prompts and allowed tools.
- Frontend: Patients (search + language filter, drawer with profile, caregiver, appointments,
  communication timeline), Doctors (department filter, today's availability bar), Appointments
  (day view with doctors as columns, off-hours/lunch shading, now line, popover, list toggle,
  "Mark arrived" via the backend), Agents grid; dashboard/topbar on the new schema; Doctors added to
  the sidebar.

**Verified**
- Logged out: REST returns 0 rows. Logged in as admin: own tenant's rows only; direct REST insert → 403.
- Backend accepts the project's ES256 JWT; check-in rules (404 unknown, 409 not today) and audit log.
- Realtime: an appointment updated in the DB re-renders the calendar within ~2 s.
- `npm test`: 36 passed. Browser: all pages at 1440/1024, light/dark; console clean.

**Notes for Phase 3**
- Tool handlers go through `PolicyEngine` → services; use `call_sessions` (30-min expiry) for
  verification and `appointment_slots.held_*` for 3-minute holds.
- Worker jobs to add: release expired holds; `ensure_slots` to keep 14 days ahead.
- `backend/app/policy/engine.py` is still the Phase 1 skeleton — Phase 3 replaces it with the full
  pipeline (schema → permission → tenant → verification → business rules → transaction → audit).

---

## Fast track (demo slice of Phases 3, 4 and 6) · awaiting voice test

Built under time pressure to reach a working demo; the remaining parts of Phases 3/4/6 are listed below.

**Delivered**
- `backend/app/services/tools.py`: tools verify_patient, list_departments, search_doctors (Telugu/Devanagari/
  Latin names + static symptom→department map), get_available_slots (max 3, part_of_day, spoken te/hi/en),
  hold_slot (atomic, 3 min), create_appointment (needs own hold + verified caller, one per doctor per day),
  get_patient_appointments, cancel_appointment (cutoff), escalate, record_outcome, get_hospital_info.
  `run_tool` = policy checks (tool exists, call live, agent allowed, verification valid) → handler →
  agent_actions + call_events (+ audit_logs on writes).
- `backend/app/api/internal.py` (X-Internal-Key): calls/start, transcript, event, end; tools/{name}.
- `voice/bot.py`: SmallWebRTC → Sarvam STT (saaras, codemix) → language tracker (dominant of last 3 turns,
  switches TTS language) → OpenAI LLM with backend tools → Sarvam TTS (bulbul), Silero VAD, interruptions,
  filler line while tools run, recording disclosure + personalised greeting, transcripts to backend.
  `voice/main.py`: POST/PATCH /api/offer.
- Frontend Test Call sheet: mic button, state, waveform, live transcript + ToolCallCards via Realtime.
- Worker housekeeping: release expired holds, close stale live calls.
- Browser Test Call simulates a call from patient #1 (SEED_TEST_PHONE); verification = birth year / DOB.

**Not yet (remaining from Phases 3/4/6)**: parse_spoken_time, reschedule_appointment, rapidfuzz +
indic-transliteration matching, Tool Playground page, pytest for tool rules, per-turn latency to
call_metrics, Pipecat Flows handoff, silence/DTMF handling.
