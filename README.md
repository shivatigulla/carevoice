# CareVoice

Multi-agent AI voice operations platform for hospitals in India. AI voice agents make and receive
normal phone calls in **Telugu, Hindi and English** (with natural code-mixing), book appointments,
make follow-up calls — and hospital staff watch everything live on a dashboard.

> Built in phases — see [`docs/PROGRESS.md`](docs/PROGRESS.md) for what's done. Read
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (the rules) and [`docs/DESIGN.md`](docs/DESIGN.md)
> (the look) before building features.

```
backend/    FastAPI API + worker.py (APScheduler background jobs)     → http://localhost:8000
voice/      Real-time voice service (pipecat-ai)                      → http://localhost:8001
frontend/   React + Vite + Tailwind + shadcn/ui dashboard             → http://localhost:5173
supabase/   Supabase CLI project — SQL migrations live here
docs/       Architecture and design rules
scripts/    Cross-platform helper scripts used by npm
```

No Docker — everything runs directly on your machine (Windows, macOS or Linux).

---

## 1. Install the prerequisites

| Tool        | Version | Get it                                                            |
|-------------|---------|-------------------------------------------------------------------|
| Node.js     | 20+     | https://nodejs.org                                                |
| Python      | **3.11**| https://www.python.org/downloads/ (on Windows, tick "Add to PATH")|
| A Supabase project | — | https://supabase.com/dashboard                                 |

Check them:

```bash
node -v
```

```bash
python --version
```

(On Windows, `py -3.11 --version` should also work.)

## 2. Install everything

From the project root:

```bash
npm install
```

```bash
npm run setup
```

`npm run setup` creates a Python virtual environment in `backend/.venv` and `voice/.venv`, installs
their requirements, installs the frontend packages, and creates `backend/.env`, `voice/.env` and
`frontend/.env` from the `.env.example` files (it never overwrites an existing `.env`).

## 3. Where to find each Supabase key

Open your project at https://supabase.com/dashboard.

| Variable | Where to find it | Goes in |
|---|---|---|
| **Project ref** | The ID in your dashboard URL: `supabase.com/dashboard/project/<project-ref>` | (used for linking) |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | **Project Settings → Data API → Project URL** — looks like `https://<project-ref>.supabase.co` | backend, voice, frontend |
| `VITE_SUPABASE_ANON_KEY` | **Project Settings → API Keys** → the **anon / publishable** key. Safe for the browser (RLS protects data). | frontend only |
| `SUPABASE_JWT_SECRET` | **Project Settings → JWT Keys** → *Legacy JWT secret* (reveal and copy). Lets the backend verify staff logins. | backend, voice |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API Keys** → the **service_role / secret** key. ⚠️ Bypasses all security — **backend only, never in the frontend, never committed.** | backend, voice |
| `DATABASE_URL` | Click **Connect** (top of the dashboard) → **Connection string** → **Session pooler**. Copy it and replace `[YOUR-PASSWORD]` with your database password. | backend |
| Database password | You chose it when creating the project. Forgot it? **Project Settings → Database → Reset database password**. | inside `DATABASE_URL` |

`DATABASE_URL` looks like:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

(If your password has special characters like `@` or `#`, URL-encode them, e.g. `@` → `%40`.)

### The other keys

| Variable | Where |
|---|---|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `SARVAM_API_KEY` | https://dashboard.sarvam.ai → API keys |
| `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SUBDOMAIN`, `EXOPHONE` | Exotel dashboard → **API Settings** (SID, key, token, subdomain) and **ExoPhones** (your number) |
| `TWILIO_*` | Only if `TELEPHONY_PROVIDER=twilio`: https://console.twilio.com |
| `INTERNAL_API_KEY` | Make one up — any long random string. Use the **same** value in `backend/.env` and `voice/.env`. |
| `PUBLIC_BASE_URL` | Needed later for real phone calls: a public HTTPS URL that reaches your machine (e.g. an ngrok or cloudflared tunnel). |
| `SEED_TEST_PHONE` | Your own mobile, e.g. `+919876543210` (a bare 10-digit Indian number is fine). Seeded as patient #1 so test calls recognise you. |
| `SEED_TEST_NAME`, `SEED_TEST_DOB` | Optional: the name and date of birth (YYYY-MM-DD) of that test patient. Agents use them to verify you on calls. |
| `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` | The dashboard login the seed script creates for you. |
| `PRICE_*` | Your costs in ₹ for per-call cost analytics: telephony per minute, speech-to-text per second, text-to-speech per 1,000 characters, LLM per million input/output tokens. Copy them from each provider's pricing page; leave `0` to skip. |

Fill in `backend/.env`, `voice/.env` and `frontend/.env`. The frontend only needs the four `VITE_*`
values.

## 4. Link the Supabase CLI and create the database

The Supabase CLI is installed locally by `npm install` (use it through `npx supabase`).

Log in (opens your browser once):

```bash
npx supabase login
```

Link this folder to your project (it asks for the database password):

```bash
npm run db:link -- --project-ref <your-project-ref>
```

Create all tables, security policies and realtime settings:

```bash
npm run db:push
```

Create the demo hospital (Sunrise Multispeciality Hospital, Hyderabad): departments, 10 doctors,
14 days of appointment slots, 30 patients, upcoming appointments, the six AI agents and your admin
login:

```bash
npm run db:seed
```

The seed is safe to run again: it only adds what's missing. Demo patients use +91 555… numbers, which
no Indian mobile uses, so automated calls can never reach a real person — except patient #1, which is
your `SEED_TEST_PHONE`.

## 5. Run it

```bash
npm run dev
```

This starts all four processes with coloured, labelled logs:

| Label     | What                         | URL                          |
|-----------|------------------------------|------------------------------|
| `backend` | FastAPI API                  | http://localhost:8000/docs   |
| `voice`   | Voice service                | http://localhost:8001/health |
| `worker`  | Background jobs              | —                            |
| `web`     | Dashboard                    | **http://localhost:5173**    |

Open http://localhost:5173 and sign in with `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD`.
Press **Ctrl C** to stop everything.

Run one piece at a time with `npm run dev:backend`, `dev:voice`, `dev:worker` or `dev:frontend`.

### Is everything connected?

The pill in the top bar shows the backend's health; click it for details. You can also open
http://localhost:8000/health — it checks the database connection, Supabase Storage, and whether the
OpenAI and Sarvam keys are set.

If `frontend/.env` has no Supabase keys yet, the dashboard opens in **setup mode** with a banner, so
you can still look around.

## Scripts

| Command | Does |
|---|---|
| `npm run setup` | Create Python venvs, install all dependencies, create `.env` files |
| `npm run dev` | Start backend, voice, worker and frontend together |
| `npm run dev:backend` / `dev:voice` / `dev:worker` / `dev:frontend` | Start one service |
| `npm run db:link -- --project-ref <ref>` | Link the Supabase CLI to your project |
| `npm run db:push` | Apply new migrations in `supabase/migrations` to your project |
| `npm run db:seed` | Seed hospital, agents, admin login (idempotent) |
| `npm run build` | Production build of the frontend |
| `npm test` | Run the backend test suite (pytest) |
| `npm run demo:reset` | Reset a lively demo hospital *(arrives in Phase 18)* |
| `npm run eval` | Run the conversation quality evaluation *(arrives in Phase 16)* |

## Troubleshooting

- **`virtualenv not found`** → run `npm run setup`.
- **`Python 3.11 not found`** → install Python 3.11; on Windows make sure the `py` launcher is installed.
- **Status pill says "API offline"** → the backend isn't running or `VITE_API_URL` is wrong.
- **"Database down"** → check `DATABASE_URL` (Session pooler string, password filled in, special
  characters URL-encoded).
- **Signed in but everything is empty / "No hospital assigned"** → run `npm run db:seed` with
  `DEMO_ADMIN_EMAIL` set, and sign in as that user.
- **Changed a `.env`?** Restart `npm run dev` (Vite and the Python services read env at startup).
