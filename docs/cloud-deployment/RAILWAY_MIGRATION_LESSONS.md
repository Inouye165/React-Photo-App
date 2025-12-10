# Railway Cloud Deployment – Migration 1 Lessons

## Overview

This document captures the first migration of the photo app backend and worker to Railway cloud, summarizing architecture changes, key issues, fixes, environment variable requirements, and lessons learned. It is intended as a persistent reference for future deployments and troubleshooting.

## Architecture (Local vs Railway)

| Component  | Local (Pre-Migration)                | Railway (Post-Migration)                |
|------------|--------------------------------------|-----------------------------------------|
| Backend    | Node/Express on http://localhost:3001| Railway `web` service (Express API)     |
| Worker     | BullMQ/AI worker running locally     | Railway `worker` service (BullMQ/AI)    |
| Frontend   | Vite dev server on http://localhost:5173 | Local, connects to Railway backend via VITE_API_URL |

## Issues & Fixes

### Issue 1 — Worker Crashing: PostgreSQL Not Configured
- **Symptoms:**
  - Railway worker logs: `[db] ERROR: PostgreSQL not configured. DATABASE_URL or SUPABASE_DB_URL is required.`
- **Root Cause:**
  - `server/db/index.js` expects `SUPABASE_DB_URL` or `DATABASE_URL`.
  - These were missing in Railway worker service env.
- **Fix Implemented:**
  - Added `SUPABASE_DB_URL` (and optionally `DATABASE_URL`) to both web and worker Railway services.
- **Key Lesson:**
  - Worker needs the same DB env vars as the web service.

### Issue 2 — Worker Crashing: Supabase Client Not Configured
- **Symptoms:**
  - `[supabaseClient] Missing required Supabase environment variable(s): SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.`
- **Root Cause:**
  - `server/lib/supabaseClient.js` expects `SUPABASE_URL` and either `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
  - Not set in Railway worker (and sometimes not in web).
- **Fix Implemented:**
  - Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) in both web and worker Railway services.
- **Key Lesson:**
  - Any shared infra client (Supabase, Redis, etc.) needs its env vars in every service that imports it.

### Issue 3 — Frontend Still Calling localhost:3001
- **Symptoms:**
  - Frontend API calls failed or hit the wrong backend.
- **Root Cause:**
  - API base URL was scattered and sometimes hard-coded as `http://localhost:3001`.
- **Fix Implemented:**
  - Centralized API config in `src/config/apiConfig.js`.
  - Updated all frontend code to use a single `API_BASE_URL` from env.
  - Documented `VITE_API_URL` in `.env.example` and set in Railway web service.
- **Key Lesson:**
  - Centralize cross-cutting config (like API base URLs). Grep for `localhost:` before deploying.

### Issue 4 — 401s & {"success":false,"error":"Access token required"}
- **Symptoms:**
  - 401s and auth errors on protected endpoints, flaky login/logout, especially cross-origin.
- **Root Cause:**
  - Cookies not configured for production SameSite/cross-origin.
  - Logout did not clear cookies properly due to mismatched options.
- **Fix Implemented:**
  - Centralized cookie config (e.g., `cookieConfig.js`).
  - Used `sameSite: 'none', secure: true` for cross-origin (with `COOKIE_SAME_SITE=none` in Railway env).
  - Ensured logout uses matching clearCookie options.
  - Frontend fetches use `credentials: 'include'`.
- **Key Lesson:**
  - Cross-origin auth requires correct cookie, CORS, and frontend fetch config. Clear cookies with matching options.

### Issue 5 — /photos Endpoints: 500/HTTP2 Errors/Laggy State Updates
- **Symptoms:**
  - 500s, HTTP2 errors, and laggy UI on photo state changes.
- **Root Cause:**
  - Backend errors, unstable worker, UI depending on polling, React 18 Strict Mode double-invocation.
- **Fix Implemented:**
  - Fixed env vars, stabilized worker, ensured latest code deployed.
- **Key Lesson:**
  - Debug backend endpoints independently first. Confirm deployed code matches local.

### Issue 6 — "Why is the URL purple?"
- **Symptoms:**
  - Purple links in browser.
- **Root Cause:**
  - Browser history styling, not a bug.
- **Key Lesson:**
  - Not all UI quirks are bugs.

## Environment Variables Inventory

### Web Service (Express API)
- SUPABASE_DB_URL
- DATABASE_URL (optional)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
- COOKIE_SAME_SITE
- JWT_SECRET
- REDIS_URL
- VITE_API_URL (if SSR or serving frontend)

### Worker Service (BullMQ/AI)
- SUPABASE_DB_URL
- DATABASE_URL (optional)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
- REDIS_URL
- Any AI/ML keys (e.g., OPENAI_API_KEY, GEMINI_API_KEY)

### Shared
- SUPABASE_DB_URL
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- REDIS_URL

### Frontend (Vite)
- VITE_API_URL
- (Legacy: VITE_API_BASE_URL)

## Lessons Learned / Best Practices

- Inventory all required env vars before deploying. Document them per service.
- Centralize config (API URLs, cookies, CORS, ports) in code.
- Always confirm deployed code matches tested code (commit, push, verify commit hash).
- Both web and worker need nearly identical env vars.
- Add a simple `/health` endpoint to verify deployment basics before debugging deeper issues.
- Use tests and grep for `localhost:` or hard-coded values before production deploys.

## Future TODOs & Improvements

- Add a `RAILWAY_DEPLOYMENT.md` with architecture diagrams, env var lists, and deployment/runbook steps.
- Harden `/photos` endpoints: add tests, improve error logging, confirm production assumptions.
- Improve gallery UX/state refresh: consider optimistic UI, refresh hooks, or realtime updates.
- Add Railway alerts for worker crash loops, excessive 5xx errors, and log AI pipeline runs more explicitly.
  
---

## Additional Lessons (VSC LLM chatGPT4.1)

- When fixing cross-origin auth, do **not** rename existing cookie names or change auth semantics—only fix config and fetch usage.
- Centralizing cookie config prevents subtle bugs and makes cross-origin support explicit and maintainable.
- If you update cookie config, update related tests to match new SameSite/secure logic.
- When deploying to Railway, set `COOKIE_SAME_SITE=none` in the Railway environment for cross-origin support.
- After merging auth/cookie fixes, always test login/logout in a real browser (not just API tools) to confirm session behavior.
- Use a single source of truth for cookie options (set and clear) to avoid logout bugs.
- Document any changes to `.env.example` and keep it in sync with actual deployment requirements.
