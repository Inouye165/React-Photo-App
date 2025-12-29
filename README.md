# Lumina

![Status: Prototype](https://img.shields.io/badge/status-prototype-yellow.svg)
[![Tests](https://img.shields.io/badge/tests-vitest%20%2B%20jest-brightgreen.svg)](TESTING.md)
[![Security](https://img.shields.io/badge/security-JWT%20%2B%20RLS-blue.svg)](https://supabase.com/docs/guides/auth)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-Restricted-red.svg)](LICENSE)

Lumina is a photo workspace I'm building. The main goal? Stop doing simple tutorials and actually build something that handles the messy, hard stuff—like real security, heavy file uploads, and architecture that doesn't fall apart.

The frontend is still rough (I'm working on it), but I've spent a ton of time making the backend and security production-grade. Eventually, I want this to be a place where you can share photos without handing over your data to big tech.

**Author:** Ron Inouye ([@Inouye165](https://github.com/Inouye165))

## Why I'm Building This

I wanted to see what it actually takes to ship a secure, cloud-deployed app. Not just the "happy path" you see in guides, but the real deal.

My focus has been on:
*   **Not breaking things:** Architecting it so I can add features later without rewriting everything.
*   **Security that isn't fake:** Using Row-Level Security (RLS) from the start, not patching it in later.
*   **Modern tools:** Getting my hands dirty with Supabase, Docker, and real deployment pipelines.

It's definitely an engineering prototype right now. I care more about the engine than the paint job.

## The Vibe

*   **Privacy is the default:** Everything starts with "can other people see this?" (The answer should be no).
*   **No Security Theater:** I'm trying to be honest about what's secure and what's still a WIP.

## The Tech Stack (The Interesting Parts)

This isn't just a wrapper around an API. Here's what's actually happening under the hood:

*   **Frontend:** React 19 + Vite 7. I'm using Zustand for state because Redux is too much boilerplate. Tailwind 4 handles the styling.
*   **Backend:** Node.js with Express. It's stateless and scales well.
*   **Database:** PostgreSQL (via Supabase) with strict Row-Level Security (RLS). No "admin" keys in the frontend.
*   **AI Orchestration:** I'm using LangGraph to build actual workflows, not just single prompts. It decides if a photo needs food analysis, collectible valuation, or just a scenery description.
*   **Job Queue:** BullMQ + Redis. Heavy stuff like thumbnail generation and AI analysis happens in the background so the upload endpoint stays fast.
*   **Streaming Uploads:** Files stream directly from the request to Supabase Storage. They never touch the server's disk.
*   **Testing:** Over 1,100 tests using Vitest, Playwright, and Jest. I take testing seriously.

## Cool Features & Experiments

### AI Photo Concierge
I'm using LangGraph to create a "smart" agent that looks at your photos:
*   **Smart Routing:** It classifies photos (Food, Collectible, Scenery) and picks the right "expert" agent to handle it.
*   **Collectibles:** It tries to identify comic books or trading cards and even estimates their grade/value.
*   **Location Intel:** If you take a picture of food, it tries to find the restaurant nearby using your GPS coordinates.

### Engineering & Security
*   **Zero-Disk Architecture:** Uploads are streamed, verified, and hashed on the fly.
*   **HEIC Support:** Automatic conversion for iPhone photos using `heic-convert` (server) and `heic2any` (client).
*   **Security First:**
    *   **RLS:** Database policies ensure users can only see their own data.
    *   **Unified onboarding:** Invite/recovery flows land on `/reset-password`, which atomically sets a strong password + required username before granting access.
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
*   If you don't have the Google Maps keys, it falls back to OpenStreetMap.
*   The backend needs an OpenAI key to start (unless you're in test mode).

## How I Test This Thing

I don't write tests just to get green badges. I write them so I can sleep at night after a refactor.

### Frontend & Root
Run these from the main folder:

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
| `npm test` | Backend unit tests (Jest). |
| `npm run test:db` | Just checks if the DB connection is alive. |
| `npm run verify:migrations` | Makes sure the schema matches the migration files. |

## Docs

*   [Testing Guide](TESTING.md)
*   [Project Status & Deep Dive](docs/STATUS.md)
*   [Security Checklist](docs/SECURITY_CODING_MAINTENANCE.md)

## Technical Debt

*   [TypeScript refactor candidates](typescript-refactor-candidates.md)

## License

**Restricted License.** Free to read and learn from, but you cannot use this commercially or redistribute it without permission. See [LICENSE](LICENSE) for details.
