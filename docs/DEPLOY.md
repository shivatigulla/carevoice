# Deploying CareVoice

| Part | Host | Notes |
|---|---|---|
| Database, Auth, Realtime, Storage | Supabase | Already live — migrations via `npm run db:push` |
| Dashboard (`frontend/`) | Vercel | Static Vite build, SPA rewrites in `frontend/vercel.json` |
| Backend API + background jobs (`backend/`) | Render (free web service) | `render.yaml`; `RUN_SCHEDULER=true` runs the worker jobs inside the API |
| Phone calls | Bolna | Backend calls Bolna's API; no public webhook needed (the backend polls call status) |
| Browser voice test (`voice/`) | Local only | Needs WebRTC/TURN to work over the internet; the dashboard hides it when `VITE_VOICE_URL` is unset |

## 1. GitHub
The repo must be on GitHub (private is fine). `.env` files are git-ignored and never pushed.

## 2. Backend on Render
1. https://dashboard.render.com → **New → Blueprint** → connect GitHub → pick the repo. Render reads `render.yaml`.
2. Fill the secret values it asks for (copy from `backend/.env`): `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `OPENAI_API_KEY`, `SARVAM_API_KEY`, `BOLNA_API_KEY`,
   `BOLNA_AGENT_ID`. For `CORS_ORIGINS` enter your Vercel URL once you have it (step 3) — Vercel preview
   URLs are already allowed by `CORS_ORIGIN_REGEX`.
3. Deploy. Check `https://<your-service>.onrender.com/health` → `"status": "ok"`.

Free Render services sleep after 15 minutes idle (first request then takes ~50 s). While the dashboard is
open it pings `/health` every 30 s, which keeps the backend — and its call-sync jobs — awake.

## 3. Dashboard on Vercel
1. https://vercel.com/new → import the repo → **Root Directory: `frontend`** (framework: Vite).
2. Environment variables:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — from `frontend/.env`
   - `VITE_API_URL` — `https://<your-service>.onrender.com`
   - do **not** set `VITE_VOICE_URL` (hides the local-only browser voice test)
3. Deploy, then put the Vercel URL into Render's `CORS_ORIGINS` and redeploy the backend.

## 4. Supabase Auth
Supabase → **Authentication → URL Configuration** → set **Site URL** to the Vercel URL (used in auth emails).

## Local development is unchanged
`npm run dev` still runs backend, voice, worker and frontend on your machine.
