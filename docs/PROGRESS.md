# CareVoice — Build Progress

Work proceeds phase by phase, in order. Each phase ends with: run → test (browser for UI, pytest for
backend) → fix → `git commit -m "phase N: <name>"`.

**Resuming work:** read this file and [`ARCHITECTURE.md`](ARCHITECTURE.md), then continue with the
first phase that is not `done`.

| #  | Phase                                        | Status  |
|----|----------------------------------------------|---------|
| 1  | Foundation                                   | done    |
| 2  | Database, auth, seed, data pages             | todo    |
| 3  | Tools + Policy Engine                        | todo    |
| 4  | Voice core + browser Test Call               | todo    |
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

**Notes for Phase 2**
- `supabase/migrations/20260925000000_foundation.sql` is a **draft that has never been pushed**.
  Phase 2 replaces it with the full schema (staff, departments, doctors, slots, call_sessions,
  call_events, …). Do not `db:push` before Phase 2.
- Dashboard hooks (`frontend/src/hooks/use-data.ts`) and `backend/app/models` follow the draft
  schema and must be updated with it.
- Backend JWT verification (for FastAPI writes) arrives in Phase 2 with auth. Newer Supabase
  projects sign user JWTs with asymmetric keys (JWKS); support both that and the legacy
  `SUPABASE_JWT_SECRET`.
- Frontend packages for later phases (wavesurfer.js, @pipecat-ai/client-js, small-webrtc
  transport) and voice extras (pipecat-ai-flows, webrtc) are added in the phase that uses them.
