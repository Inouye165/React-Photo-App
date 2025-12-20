
# Lumina

# Lumina (formerly React Photo App)

![Status: High-Performance Engineering Prototype (Active Development)](https://img.shields.io/badge/status-high--performance--prototype-yellow.svg)
[![Tests](https://img.shields.io/badge/tests-vitest%20%2B%20jest-brightgreen.svg)](https://github.com/Inouye165/React-Photo-App)
[![Security](https://img.shields.io/badge/security-JWT%20%2B%20RLS-blue.svg)](https://supabase.com/docs/guides/auth)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **A photo workspace I built to learn how real production apps are architected — security, scaling, and all the unglamorous stuff.**

This started as a way to practice backend engineering and security habits. It's grown into something I actually use. The backend is solid; the frontend is functional but still rough around the edges. Maybe one day it'll support sharing and collaboration, but for now it's focused on doing the basics right.

**Author:** Ron Inouye ([@Inouye165](https://github.com/Inouye165))

---


## 🎯 Why This Exists

This project was created to learn and practice building large-scale, secure, cloud-deployed web applications. The focus is on:

- Engineering for scale: designing codebases and architectures that can grow and be maintained over time
- Security coding habits: applying best practices for authentication, data isolation, and safe defaults
- Cloud deployment: using modern cloud platforms and managed services (Supabase, Railway, Vercel, Docker)

It is not a consumer product or tutorial, but a high-performance engineering prototype. The backend and security posture are prioritized, with the frontend evolving as a functional draft. The main goal is to develop and demonstrate real-world engineering and security skills in a modern web stack.

**Read the full journey:** [Product Story](docs/PRODUCT_STORY.md) (Sept–Nov 2025)

---

## 💪 What Sets This Apart

This isn't a tutorial project with placeholder tests. Here's what's actually here:

| Area | What's Here |
|------|-------------|
| **Test Suite** | 1,166 tests (476 frontend, 690 backend) — real coverage, not "TODO: add tests" |
| **Streaming Uploads** | Zero-disk: files stream directly to cloud storage with hash verification |
| **Security Layers** | RLS, Bearer auth, Origin allowlisting, rate limiting, secret scanning |
| **Background Jobs** | BullMQ + Redis for thumbnails, AI, HEIC conversion — nothing blocks the request |
| **AI Pipeline** | LangGraph workflows with retry logic and fallbacks, not spaghetti API calls |
| **HEIC Conversion** | Pure Node.js (Sharp + heic-convert) — deploys anywhere without ImageMagick |

---

## 🌱 Values
- **Be decent:** Everyone's welcome here.
- **Privacy matters:** Your photos stay yours. User isolation isn't an afterthought.
- **No security theater:** If something's a known limitation, it gets documented.
- **Keep it respectful:** Standard open-source community expectations apply.

## 🔒 Privacy
Each user's photos, metadata, and AI outputs are isolated. You can't accidentally (or intentionally) see someone else's stuff. If sharing features ever get added, they'll be opt-in with clear permissions.

## ✨ Architectural Experiments & Features

### 🧠 **AI Photo Concierge (Prototype)**
- **Unified Context Tab:** EditPage now combines story description and location map in a single, vertically stacked Context view for streamlined editing.
- **Object & Scene Detection:** Recognizes dogs, food, collectibles, and 100+ categories (via AI models)
- **Food/Location Agent:** Attempts to cross-reference food photos with nearby restaurants using GPS and Google Places API
- **Collectibles Valuation:** Prototype logic for estimating value of items like Pyrex, comics, memorabilia
- **Location Intelligence:** Tries to identify visible landmarks, mountains, or lakes in the photo background

### 🏗️ **Backend & AI Architecture**
- **Zero-Disk Streaming:** Uploads stream directly to Supabase Storage—no local disk bottlenecks
- **LangGraph AI Pipeline:** Modular workflow (EXIF → GPS → Image Analysis → POI Lookup → Value Estimation)
- **Background Processing:** BullMQ + Redis for offloading heavy tasks (thumbnails, AI, HEIC conversion)
- **Row-Level Security:** Supabase RLS for strict user data isolation

### 🔒 **Security (Experimental)**
- **API Auth:** Protected API routes require `Authorization: Bearer <token>`.
- **Images/Thumbnails:** Prefer signed thumbnail URLs for `<img>`; otherwise use Bearer auth. A deprecated cookie fallback may exist only for legacy image access/E2E and will be removed.
- **CSRF defense:** State-changing auth endpoints enforce strict Origin/Referer allowlisting (no CSRF tokens).
- **Secret scanning:** Use `npm run secret-scan` (and hooks if enabled) to block committing secret-like strings.
- **Experimental Beta Mode:** Optional beta features with an explicit privacy disclaimer and user acknowledgement
- **Content Security Policy:** Helmet-enforced CSP (tests exist; CI setup depends on your environment)
- **Concurrency Limits:** Rate limiting to prevent upload storms

### ✅ Engineering habits I'm practicing
- Write security tests, not just happy-path tests
- Don't leak secrets in error messages or logs
- Keep docs updated when the code changes (harder than it sounds)
- Measure performance and actually look at the numbers

### 📸 **Photo Handling**
- **HEIC Auto-Convert:** HEIC/HEIF → JPEG via Sharp, with `heic-convert` fallback (no ImageMagick dependency)
- **Optimistic Uploads:** Fast, responsive uploads with immediate navigation and background processing
- **Compass Overlay:** Shows camera direction on map pins (prototype)
- **Smart Thumbnails:** Lazy-loaded, optimized for large galleries
- **Date Range Filtering:** Browse by month/year (basic infinite scroll)

---


## 🏗️ Architecture Highlights

### The Upload Pipeline
```
User uploads photo 
  → Busboy streams to Supabase Storage (zero local disk)
  → Hash calculated during stream (integrity check)
  → BullMQ job queued for processing
  → Worker extracts EXIF, generates thumbnail, runs AI
  → Frontend polls for completion, displays results
```

### AI Processing Status (Polling)
- The UI shows **Analyzing...** while the backend reports `photo.state === 'inprogress'`.
- The client polls `GET /photos/:id` (with cache-busting query params) until `state` is terminal (`finished` or `error`).
- Polling is implemented in the Zustand store (`startAiPolling` / `stopAiPolling`) as the **single source of truth** to avoid competing pollers and stale UI state.

- Upload photos (including HEIC/HEIF) and browse them in a gallery.
- Open an edit page that shows derived metadata (EXIF, timestamps) and a map when GPS exists.
- Run background processing via a worker (thumbnails, EXIF extraction, optional AI enrichment).

![Edit page screenshot](docs/screenshots/edit_page.png)

## Tech stack (high level)

- Frontend: React + Vite + Tailwind, Zustand
- Backend: Node.js + Express
- Data: Postgres (Supabase or local) + Supabase Storage
- Jobs: BullMQ + Redis
- Image processing: Sharp + `heic-convert` fallback
- Tests: Vitest (web) + Jest (server) + Playwright (E2E)

## Architecture notes

**Why bother?** Most tutorials teach "save to disk, then upload." That creates bottlenecks. Streaming straight to cloud storage skips that problem entirely.

```
upload
  → stream to storage
  → enqueue background job
  → worker extracts EXIF, generates thumbnails
  → (optional) AI enrichment
```

The UI polls photo status while background work is running.
**Why bother?** Without this, you end up with a mess of API calls scattered everywhere. LangGraph keeps it organized and testable.

## Quick start (local dev)

### Prerequisites

- Node.js 20+ (see `engines`)
- Docker + docker-compose (recommended for local Postgres + Redis)

### Setup

```bash
# install deps
npm install
cd server && npm install && cd ..

# start local services (optional, but recommended)
docker-compose up -d db redis

# env
cp server/.env.example server/.env

# migrations
cd server && npx knex migrate:latest --knexfile knexfile.js && cd ..

# run (separate terminals)
npm run dev
cd server && npm start
cd server && npm run worker
```

Frontend: http://localhost:5173

Backend: http://localhost:3001

Notes:

- The worker is required for thumbnail generation and background enrichment.
- If Google Places keys are missing, Places-based enrichment is skipped.
- In non-test environments, the backend is configured to refuse startup if `OPENAI_API_KEY` is missing.

## Configuration

See `server/.env.example` for the full list. Commonly required values are:

- `DATABASE_URL` / `SUPABASE_DB_URL` (Postgres)
- `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- `JWT_SECRET`
- `OPENAI_API_KEY` (required for non-test server startup)

## Security model (current behavior)

- API routes use Bearer tokens (`Authorization: Bearer <token>`) and do not support cookie auth.
- Image routes prefer signed URLs for `<img>` tags; they also support Bearer tokens.
- A deprecated cookie fallback exists for some image requests during transition and is intended to be removed.
- State-changing auth endpoints use Origin/Referer allowlisting.
- Supabase RLS is part of the data-isolation story when running against Supabase.

Security maintenance / secure coding notes:

- [docs/SECURITY_CODING_MAINTENANCE.md](docs/SECURITY_CODING_MAINTENANCE.md)
- [SECURITY_REMEDIATION_SUMMARY.md](SECURITY_REMEDIATION_SUMMARY.md)

## Docs
Started because I wanted to learn how production apps actually work — not just follow tutorials.

- [TESTING.md](TESTING.md)
- [docs/DEV.md](docs/DEV.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [server/README.md](server/README.md)

## License

MIT - see [LICENSE](LICENSE)