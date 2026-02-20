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
