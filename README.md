# Lumina

![Status: Prototype](https://img.shields.io/badge/status-prototype-yellow.svg)
[![Tests](https://img.shields.io/badge/tests-vitest%20%2B%20jest-brightgreen.svg)](TESTING.md)
[![Security](https://img.shields.io/badge/security-JWT%20%2B%20RLS-blue.svg)](https://supabase.com/docs/guides/auth)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-Restricted-red.svg)](LICENSE)

Lumina is a personal photo workspace project focused on secure uploads, background processing, and privacy-friendly defaults.

The frontend is a work in progress, while the backend and security pieces are the primary focus. The long-term goal is a private photo space without relying on big-tech social platforms.

**Author:** Ron Inouye ([@Inouye165](https://github.com/Inouye165))

## Why I'm Building This

I wanted to understand what it takes to ship a secure, cloud-deployed app beyond the “happy path.”

My focus has been on:
*   **Maintainability:** Structuring the codebase so new features don’t require rewrites.
*   **Security first:** Using Row-Level Security (RLS) from the start.
*   **Modern tooling:** Supabase, Docker, and production-style deployment workflows.

It’s an engineering prototype with more emphasis on reliability than UI polish.

## Principles

*   **Privacy by default:** Access is restricted unless explicitly shared.
*   **No security theater:** Document what’s secure and what is still in progress.

## The Tech Stack (The Interesting Parts)

Key parts of the stack:

*   **Frontend:** React 19 + Vite 7. Zustand for state. Tailwind 4 for styling.
*   **Backend:** Node.js with Express (stateless).
*   **Database:** PostgreSQL (via Supabase) with strict Row-Level Security (RLS). No "admin" keys in the frontend.
*   **AI Orchestration:** LangGraph pipelines route photos to food, collectible, or scenery analysis.
*   **Job Queue:** BullMQ + Redis. Heavy stuff like thumbnail generation and AI analysis happens in the background so the upload endpoint stays fast.
*   **Streaming Uploads:** Files stream directly from the request to Supabase Storage. They never touch the server's disk.
*   **Testing:** Vitest, Playwright, and Jest.

## Security Checks

I use `gitleaks` to prevent API keys and secrets from being committed.

**Installation:**
*   **Windows:** `winget install gitleaks.gitleaks`
*   **macOS:** `brew install gitleaks`
*   **Linux:** Follow instructions at [gitleaks.io](https://gitleaks.io)

**Running the Scan:**
```bash
# Run local secret scan
npm run secret-scan:local
```

## Cool Features & Experiments

### AI Photo Concierge
LangGraph drives analysis workflows for photos:
*   **Routing:** Classifies photos (food, collectible, scenery) and selects the matching analysis path.
*   **Collectibles:** Attempts identification and produces estimated condition/value signals.
*   **Location Intel:** Uses GPS coordinates to look up nearby places when Google Places keys are configured.

### Engineering & Security
*   **Zero-Disk Architecture:** Uploads are streamed, verified, and hashed on the fly.
*   **HEIC Support:** Automatic conversion using `heic-convert` (server) and `heic2any` (client).
*   **Security First:**
    *   **RLS:** Database policies ensure users can only see their own data.
    *   **Unified onboarding:** Invite/recovery flows land on `/reset-password` to set a password and (for new users) a username.
    *   **Secret Scanning:** Custom scripts prevent me from committing API keys.
    *   **Privilege Checks:** Automated audits to ensure no code is running with unnecessary permissions.
*   **Observability:** Prometheus metrics are exposed for monitoring.

## How Uploads Work

Most tutorials tell you to save a file to the server, then upload it. I hate that because it fills up the disk. Here's how I do it:

1.  **Stream:** Photo streams from you -> Server -> Supabase Storage.
2.  **Verify:** We check the hash on the fly.
3.  **Queue:** A background job picks it up.
4.  **Process:** Workers extract the EXIF data, make thumbnails, and run the AI.
5.  **Update:** The frontend refreshes the gallery immediately. Simple and effective.

## Running It Locally

If you want to poke around:

**Prerequisites:** Node 20+, Docker (you need this for the DB and Redis).

```bash
# 1. Install dependencies
npm install
cd server && npm install && cd ..

# 2. Spin up local services
docker-compose up -d db redis

# 3. Setup environment
cp server/.env.example server/.env

# 4. Run migrations
cd server && npx knex migrate:latest --knexfile knexfile.js && cd ..

# 5. Start development (you'll need 3 terminals)
npm run dev           # Frontend
cd server && npm run dev # Backend
cd server && npm run worker # Background Worker
```

**Heads up:**
*   You need the worker running or thumbnails won't happen.
*   If Google Maps keys are missing, POI lookups are skipped.
*   The backend needs an OpenAI key to start (unless you're in test mode).
*   Media delivery redirects are controlled by `MEDIA_REDIRECT_ENABLED` in [server/.env.example](server/.env.example) to offload image bytes to storage/CDN.
*   **HITL Collectibles UI:** Set `VITE_ENABLE_COLLECTIBLES_UI=true` in your frontend `.env` to enable the Human-in-the-Loop collectible identification workflow. This provides a modal UI for reviewing and confirming AI-identified collectibles before continuing the analysis pipeline.
*   **Restart guard (optional):** The client compares a server-provided per-process `bootId` (from `/api/meta`) against `sessionStorage` to force a re-login only when the backend process restarts. `buildId` is still exposed for diagnostics, but is not used to log users out.
*   Ongoing cleanup targets: [TypeScript refactor candidates](typescript-refactor-candidates.md)

## Debugging

### Whiteboard debug logging (scoped)
Whiteboard debug logs are **scoped** and **off by default**. Enable them only when you are troubleshooting whiteboard sync issues.

**Available flags (client-side):**
- `?wbDebug=1` (or `?whiteboardDebug=1`) in the URL query string.
- `localStorage` key: `wb:debug` set to `1`, `true`, `yes`, or `on`.

**Notes:**
- These flags only affect whiteboard logs. They do **not** enable global debug logging.
- Logs are intentionally low-frequency (connection, join, snapshot load, and replay stats).

## How I Test This Thing

Tests are intended to catch regressions before CI.

### Pre-commit Test Suite

**Run these before every commit to catch issues locally that would fail CI:**

```bash
# Quick pre-commit check (recommended minimum)
npm run lint && npm test && cd server && npm test && cd ..

# Full pre-commit check (matches CI exactly)
npm run lint && \
npm test && \
npm run test:maintainability && \
npm run test:e2e && \
cd server && npm test && cd ..
```

**What each test catches:**
- `npm run lint` - ESLint + TypeScript type-check + GPS hygiene check (catches JSX namespace errors, type mismatches, import issues)
- `npm test` - Frontend unit tests (Vitest)
- `npm run test:maintainability` - Architecture rules + migration integrity (catches dead code, import violations, broken migrations)
- `npm run test:e2e` - Playwright end-to-end tests (requires app running)
- `cd server && npm test` - Backend unit tests (Jest)

**Pro tip:** The `lint` command includes `type-check` which is what caught the JSX namespace errors. Always run it before committing TypeScript changes.

### Frontend & Root
Run these from the repository root:

| Command | Why run it? |
| :--- | :--- |
| `npm test` | The standard React unit tests (Vitest). |
| `npm run test:ui` | Opens the fancy Vitest UI. Good for debugging. |
| `npm run test:e2e` | Fires up Playwright. You need the app running for this. |
| `npm run test:maintainability` | **The big one.** Runs the architecture and migration checks below. |
| `npm run test:arch` | Stops me from doing dumb stuff (like importing Pages into Components). |
| `npm run test:size` | Yells if the bundle gets too fat (>500kB). |
| `npm run test:migrations` | Spins up a temp DB to make sure migrations can actually roll back. |

### Backend
Run these inside `server/`:

| Command | Why run it? |
| :--- | :--- |
| `npm test` | Backend unit tests (Jest). (Run from `server/`, not repo root.) |
| `npm run test:db` | Just checks if the DB connection is alive. |
| `npm run verify:migrations` | Makes sure the schema matches the migration files. |

## Admin

The app includes an admin-only dashboard at `/admin` (requires a user with `app_metadata.role = admin`).

Current admin sections:
- Invites
- Suggestions Review
- Comments
- Feedback
- Assessments

## Docs

*   [Testing Guide](TESTING.md)
*   [Project Status & Deep Dive](docs/STATUS.md)
*   [Security Checklist](docs/SECURITY_CODING_MAINTENANCE.md)
*   [Group Chat Brainstorming](docs/CHAT_GROUP_BRAINSTORM.md)

## Technical Debt

*   [TypeScript refactor candidates](typescript-refactor-candidates.md)

## License

**Restricted License.** Free to read and learn from, but you cannot use this commercially or redistribute it without permission. See [LICENSE](LICENSE) for details.
