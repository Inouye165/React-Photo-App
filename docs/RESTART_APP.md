# Restarting the App (Local Sandbox)

This is a **restart-only** checklist. It assumes the sandbox environment and dependencies are already installed and configured.

## 1) Start required services

From the repo root:

- Start Postgres + Redis:
  - `docker-compose up -d db redis`

## 2) Start backend API

From the repo root (new terminal):

- `npm --prefix server start`

Expected: API health at http://127.0.0.1:3001/health

## 3) Start background worker

From the repo root (new terminal):

- `npm run worker`

## 4) Start frontend

From the repo root (new terminal):

- `npm run dev`

Expected: Frontend at http://localhost:5173/

## 5) Quick status checks (optional)

- API: http://127.0.0.1:3001/health
- Frontend: http://localhost:5173/

## Notes

- If the backend fails prestart checks, verify DB/Redis are running and `server/.env` is valid.
- If the worker can’t connect to Redis, ensure `REDIS_URL=redis://localhost:6379` in `server/.env`.
