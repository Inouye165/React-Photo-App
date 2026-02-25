# Restarting the App (Local Sandbox)

This is a **restart-only** checklist. It assumes the sandbox environment and dependencies are already installed and configured.

## Fast path (Windows)

From repo root:

- `npm run start:local`

This starts Docker services, waits for readiness, and opens separate terminals for API, worker, and frontend.

To stop everything started by the fast path:

- `npm run stop:local`

## 1) Start required services

From the repo root:

- Start Postgres + Redis:
  - `docker-compose up -d db redis`

## 2) Start backend API

From the repo root (**terminal 1**):

- `npm --prefix server start`

Expected: API health at http://127.0.0.1:3001/health

## 3) Start background worker

From the repo root (**terminal 2**):

- `npm run worker`

## 4) Start frontend

From the repo root (**terminal 3**):

- `npm run dev`

Expected: Frontend at http://localhost:5173/

## 5) Quick status checks (optional)

- API: http://127.0.0.1:3001/health
- Frontend: http://localhost:5173/

## Notes

- If the backend fails prestart checks, verify DB/Redis are running and `server/.env` is valid.
- If the worker can’t connect to Redis, ensure `REDIS_URL=redis://localhost:6379` in `server/.env`.

## Startup Robustness Log

- **2026-02-25 05:24:37 -08:00 (Windows, host: DESKTOP-0UN2H9U, monitored startup with troubleshooting)**
  - Process used: `npm run start:local` from repo root (README robust one-command startup).
  - Startup issues observed during troubleshooting pass:
    1. Preflight dependency step intermittently failed in PowerShell with `Unknown command: "pm"`.
    2. npm warning output on stderr (`ERESOLVE`) was treated as a terminating PowerShell error under `$ErrorActionPreference = 'Stop'`.
    3. Migration preflight initially failed (`schema "auth" does not exist`) when Docker Postgres override (`127.0.0.1:5432`) was used instead of local Supabase Postgres.
  - Fixes applied:
    1. Hardened npm invocation in `scripts/start-local.ps1` to prefer `npm.cmd` on Windows and use a resilient helper for preflight npm commands.
    2. Updated npm helper to run with temporary `ErrorActionPreference='Continue'` and fail only on non-zero exit codes.
    3. Updated DB selection logic to prefer local Supabase DB URL (`127.0.0.1:54330`) when available before forcing Docker DB override.
  - Verification results after fixes:
    - `http://127.0.0.1:3001/health` returned HTTP `200`.
    - `http://localhost:5173/` returned HTTP `200`.
    - Monitoring window completed with no detected stuck/error signals.
  - Structured run log:
    - `logs/start-local-runs.jsonl`
    - Contains host + ISO timestamp + status + issue/fix fields for each run.
  - Outcome: startup passed after troubleshooting and script hardening.

- **2026-02-24 13:21:11 -08:00 (Windows, host: RONS-COMPUTER, README startup validation)**
  - Process used: `npm run start:local` from repo root (README robust one-command startup).
  - Startup behavior observed:
    1. Script auto-healed a stale local Supabase startup state after detecting `supabase start is already running` with a non-ready container.
    2. Dependency/build/migration preflight checks completed and API/worker/frontend terminals were launched automatically.
    3. Monitoring window passed with no detected stuck/error signals.
  - Verification results:
    - `http://127.0.0.1:3001/health` returned HTTP `200`.
    - `http://localhost:5173/` returned HTTP `200`.
  - Outcome: startup passed smoothly (no manual fix required).

- **2026-02-24 08:40:01 -08:00 (Windows, host: RONS-COMPUTER, monitored cold-start validation)**
  - Process used: `npm run stop:local` then `npm run start:local` from repo root.
  - Startup behavior observed:
    1. `stop:local` could not stop previously tracked Lumina terminals and reported Docker daemon unavailable for container stop.
    2. `start:local` auto-started Docker Desktop, performed Supabase stale-container self-heal, then completed startup preflight checks.
  - Verification results:
    - `http://127.0.0.1:3001/health` returned HTTP `200`.
    - `http://localhost:5173/` returned HTTP `200`.
    - Monitoring window completed with no detected stuck/error signals.
  - Troubleshooting required: none (self-heal path completed automatically; no manual fix applied).
  - Outcome: startup passed.

- **2026-02-24 06:50:24 -08:00 (Windows, host: Rons-Computer, monitored `start:local` hardening validation)**
  - Process used: switched to `main`, synced with `origin/main`, removed non-`main` branches locally/remotely, then executed `npm run start:local`.
  - Startup checks exercised by script:
    1. Docker availability and daemon auto-start/wait.
    2. Local Supabase reachability/start self-heal path.
    3. Dependency install preflight (`npm install`, `npm --prefix server install` when needed).
    4. Server build preflight (`npm --prefix server run build`).
    5. Migration verify/apply preflight (`npm --prefix server run verify:migrations`, `node server/scripts/run-migrations.js`).
    6. Post-start process + endpoint monitoring window.
  - Issues observed during first pass:
    1. Startup monitor produced a false positive by matching benign log text (`disabling tracing to prevent network errors`).
  - Fix applied:
    - Tightened log failure pattern matching in `scripts/start-local.ps1` to ignore known benign warning lines and only fail on hard error signatures.
  - Verification results after fix:
    - `http://127.0.0.1:3001/health` returned HTTP `200`.
    - `http://localhost:5173/` returned HTTP `200`.
    - Monitoring window completed without process exits or hard-error matches.
  - Structured run log:
    - `logs/start-local-runs.jsonl`
    - Contains host + ISO timestamp + status + issue/fix fields for each run.
  - Outcome: startup passed after one monitor-pattern correction.

- **2026-02-23 18:15:16 -08:00 (Windows, autonomous README flow validation)**
  - Process used: `npm run stop:local` then `npm run start:local` from repo root (README robust one-command startup).
  - Startup issues observed:
    1. `stop:local` reported tracked Lumina PIDs that could not be stopped in this shell session.
    2. Docker daemon was initially not running.
    3. Local Supabase reported stale startup state (`supabase start is already running`, container not ready).
  - Recovery/fix:
    - `start:local` auto-started Docker Desktop, waited for daemon readiness, and performed Supabase self-heal/start.
    - Script then launched API/worker/frontend terminals and waited for API readiness.
  - Verification results:
    - `http://127.0.0.1:3001/health` returned HTTP `200` with `{"status":"ok",...}`.
    - `http://localhost:5173/` returned HTTP `200` and served Vite app HTML.
  - Outcome: startup passed with no manual intervention required.

- **2026-02-20 12:13:43 -08:00 (Windows, monitored run)**
  - Backend startup/migration issue observed previously: `role "authenticated" does not exist` during policy migration.
  - Fix applied in migration file to remove hard dependency on role-specific `TO authenticated` clauses.
  - Result after fix: backend, frontend, and worker started; health endpoints returned `200`.

- **2026-02-20 12:17:44 -08:00 (Laptop, operator feedback validation)**
  - Tracking correction: startup robustness notes belong in this dedicated file (not README).
  - Observed process issue: worker was already running in an earlier terminal that was not being actively monitored, and an additional frontend instance was started.
  - Expected operator behavior for robust startup checks:
    1. Verify existing listeners/processes before starting new services.
    2. Prefer `npm run stop:local` before a fresh validation pass to avoid duplicate frontend/backend/worker instances.
    3. Treat Vite port changes (`5173` -> `5174`) as normal when an instance is already running, and confirm which instance is intended for the test pass.
