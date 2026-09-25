# CareVoice Architecture

CareVoice is a multi-agent AI voice operations platform for hospitals in India. AI voice agents make
and receive ordinary phone calls in Telugu, Hindi and English (with natural code-mixing), book
appointments, place follow-up calls, and hospital staff watch everything live on a dashboard.

**The rules in this document are binding. All future work follows them.** If a change needs to break
one, update this document in the same change and say why. Build status lives in
[`PROGRESS.md`](PROGRESS.md).

---

## System overview

```
                         ┌──────────────────────────── Supabase ───────────────────────────┐
                         │  Postgres (RLS on every table)   Auth   Realtime   Storage      │
                         └────▲───────────────▲──────────────────▲───────────────▲─────────┘
                              │ SQLAlchemy    │ reads (anon key  │ live updates  │ service role
                              │ (asyncpg)     │ + user JWT, RLS) │ (RLS)         │ (server only)
  Phone ── Exotel/Twilio ──►  │               │                  │               │
     ▲          │ audio WS    │         ┌─────┴──────────────────┴──┐            │
     │          ▼             │         │  frontend (React, Vite)   │            │
     │   ┌─────────────┐  tool calls  ┌─┴──────────────┐  writes ───┼──►         │
     └───┤ voice       ├─────────────►│ backend        ├────────────┘            │
         │ (pipecat)   │  HTTP +      │ (FastAPI)      ├─────────────────────────┘
         │ STT→LLM→TTS │  internal key│ Policy Engine  │
         └─────────────┘              │ services       │◄── worker (APScheduler)
                                      └────────────────┘     same codebase, own process
```

| Service      | Folder      | Runs as                                   | Port |
|--------------|-------------|-------------------------------------------|------|
| Backend API  | `/backend`  | `uvicorn app.main:app`                    | 8000 |
| Worker       | `/backend`  | `python worker.py` (separate process)     | —    |
| Voice        | `/voice`    | `uvicorn main:app` (pipecat pipelines)    | 8001 |
| Frontend     | `/frontend` | Vite dev server                           | 5173 |
| Database     | `/supabase` | Hosted Supabase; migrations via CLI       | —    |

No Docker, no Redis, no Celery, no MinIO. Everything runs locally with `npm run dev`; telephony
providers reach the laptop through an ngrok static domain (`PUBLIC_BASE_URL`).

**Voice stack:** Pipecat + Pipecat Flows. Transport (Exotel Voicebot stream, Twilio Media Streams,
or SmallWebRTC for the browser Test Call) → Silero VAD → Sarvam STT (`saaras:v3`, streaming) →
OpenAI LLM (`OPENAI_MODEL`, streaming) → Sarvam TTS (`bulbul:v3`, streaming).

---

## Rules

### 1. The LLM never touches the database

Every action an agent takes is a **tool call** that flows through one path:

```
LLM proposes tool call → voice service → backend /internal/tools → Policy Engine → backend service → DB
```

- The voice service holds no database credentials. It calls the backend with `INTERNAL_API_KEY`.
- The **Policy Engine** (`backend/app/policy/engine.py`) checks that the active agent is allowed to
  use the tool and that the call-session state permits it (e.g. caller identity verified before
  reading or changing their appointments). Denials are returned to the LLM as structured results.
- Backend services do the actual work inside a transaction and write an audit trail.
- Tool results are the only facts an agent may state.

### 2. Multi-tenant from day one

- **Every table has `tenant_id`** (a hospital) and **RLS enabled**. (`tenants.tenant_id` is a
  generated copy of `id`, so the rule holds uniformly.)
- Staff membership lives in `tenant_members`; `public.user_tenant_ids()` powers every read policy.
- UUID primary keys (`gen_random_uuid()`).
- `created_at` / `updated_at` on everything; `updated_at` is maintained by a trigger.
- **Store UTC** (`timestamptz`), **display Asia/Kolkata**. Convert only at the edges (UI, spoken
  dates in the voice agent).

### 3. Reads vs writes

- The **frontend reads** with `supabase-js` (anon key + the user's session) under RLS, and gets live
  updates through **Supabase Realtime** (`postgres_changes`, which also respects RLS).
- **All important writes go through the FastAPI backend**, authenticated with the staff member's
  Supabase JWT (`Authorization: Bearer <access_token>`), verified server-side. End users have no
  insert/update/delete RLS policies. The backend connects as the table owner via `DATABASE_URL`.
- Service-to-service calls (voice → backend) use `X-Internal-Key: <INTERNAL_API_KEY>`.
- The **service role key** is used only by the backend (Storage, Auth admin). It is never shipped to
  the browser, and never placed in any `VITE_*` variable.

### 4. No Redis

- Short-lived state (slot holds, call-session verification) lives in Postgres tables with
  `expires_at` columns; readers ignore expired rows and the worker sweeps them.
- Background jobs are rows in `public.jobs`. The single worker process (APScheduler) claims due jobs
  with `SELECT … FOR UPDATE SKIP LOCKED`, retries with backoff, and releases jobs stuck in `running`.
- Enqueue from any backend service with `app.jobs.queue.enqueue(...)`; register handlers with
  `@job_handler("kind")`.

### 5. Providers behind interfaces

| Concern    | Interface                                   | Implementations    | Selected by            |
|------------|---------------------------------------------|--------------------|------------------------|
| Telephony  | `app.providers.telephony.TelephonyProvider` | Exotel, Twilio     | `TELEPHONY_PROVIDER`   |
| STT / TTS  | `app.providers.speech.SpeechToText/TextToSpeech` | Sarvam        | `SARVAM_*`             |
| LLM        | `app.providers.llm.LLMProvider`             | OpenAI             | `OPENAI_MODEL`         |

Swapping a provider is an env change plus one new class — never an edit to business logic. In the
voice service, the equivalent pipecat services are chosen in one factory module.

### 6. Agents are configurations, not bots

- An agent = **system prompt + allowed tools + flow nodes** (Pipecat Flows), stored per tenant in
  `agents`.
- The six roles: Reception, Appointment, Follow-up, Pre-Visit, Caring, Console (staff-facing).
- **One voice session per call.** A handoff swaps the active configuration *inside the same
  session with the same voice* — the caller never hears a transfer, and context carries over.

### 7. No fake data in the UI

- Never render placeholder numbers, sample patients or demo calls. Seed scripts create configuration
  only (tenant, agents, admin login, optional test patient).
- **Every list has loading, empty and error states** (`SkeletonCard`, `EmptyState`, `ErrorState`).

### 8. Medical safety

Agents **never diagnose, never prescribe, never give medical advice**, and **never invent** slots,
doctors, prices, policies or instructions. Anything factual must come from a tool result or approved
knowledge.
Emergencies (chest pain, breathing difficulty, heavy bleeding, unconsciousness, suicidal thoughts)
→ tell the caller to dial 108 / come to Emergency, and escalate to a human immediately.

---

## Repository layout

```
backend/
  app/
    api/            FastAPI routers (health, …)
    core/           settings, logging, time helpers
    db/             async engine/session, declarative base + column mixins
    models/         ORM models mirroring supabase/migrations
    policy/         Policy Engine
    providers/      telephony / speech / llm interfaces + implementations
    services/       business logic (supabase_admin, …)
    jobs/           Postgres job queue (SKIP LOCKED)
    seed.py         idempotent configuration seed
  worker.py         APScheduler process
  tests/            pytest suite (`npm test`)
voice/
  main.py           pipecat voice service (placeholder until Phase 4)
frontend/
  src/
    components/signature/   design-system signature components
    components/layout/      app shell (sidebar, topbar, command palette)
    components/dashboard/   dashboard panels
    hooks/                  data hooks (TanStack Query + Realtime)
    lib/                    supabase client, api client, time, env
    pages/
supabase/
  migrations/       SQL migrations — the source of truth for the schema
docs/
scripts/            cross-platform dev scripts (venv runner, setup)
```

## Schema changes

1. Add a new file in `supabase/migrations/` (`npx supabase migration new <name>`).
2. Every new table: `id uuid pk`, `tenant_id`, `created_at`, `updated_at`, the `set_updated_at`
   trigger, RLS enabled, a tenant read policy, and — if the dashboard shows it live — add it to the
   `supabase_realtime` publication.
3. Mirror it in `backend/app/models`.
4. `npm run db:push`.
