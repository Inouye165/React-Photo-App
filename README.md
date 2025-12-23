# Lumina

![Status: High-Performance Engineering Prototype (Active Development)](https://img.shields.io/badge/status-high--performance--prototype-yellow.svg)
[![Tests](https://img.shields.io/badge/tests-vitest%20%2B%20jest-brightgreen.svg)](TESTING.md)
[![Security](https://img.shields.io/badge/security-JWT%20%2B%20RLS-blue.svg)](https://supabase.com/docs/guides/auth)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

I built **Lumina** as a privacy-focused photo workspace to move beyond basic tutorials and dive into professional engineering standards. It is a long-term project tackling the "hard stuff" in web development: building for real-world security, ensuring the architecture can scale, and keeping the codebase maintainable over time.

While the frontend is a work in progress, the backend and security have been treated as the core of the project from day one. The long-term goal is to turn this into a community platform where people can share and chat without ever compromising their data isolation or privacy.

**Author:** Ron Inouye ([@Inouye165](https://github.com/Inouye165))

---

### 🎯 Why This Exists

This project started as a way to see what it takes to build a secure, cloud-deployed application at scale. Instead of just following a guide, the focus is on:

* **Engineering for the long haul:** Building an architecture that doesn’t fall apart as it grows.
* **Security as a habit:** Implementing Row-Level Security (RLS), strict data isolation, and safe defaults rather than "bolting them on" later.
* **Modern Cloud Workflows:** Getting hands-on with Supabase, Railway, Vercel, and Docker.

Lumina isn't meant to be a polished consumer product yet—it’s a high-performance engineering prototype. The focus is on the "under the hood" work over a flashy UI to demonstrate how a modern web stack should actually function.

[Read the full journey: Product Story (Sept–Nov 2025)](docs/PRODUCT_STORY.md)

---

### 🌱 Community & Values

* **Welcoming to contributors**
* **Privacy by default:** Every design choice starts with user data isolation and least-privilege access.
* **Zero "Security Theater":** Aims for total transparency regarding security trade-offs.

---

### 🔒 Privacy & User Isolation

The core of Lumina is the isolated workspace. Whether it’s your photos, EXIF metadata, or AI-generated descriptions, that data belongs to you alone. Any social features—like albums or chat—are strictly opt-in, permissioned, and auditable.

---

### 💪 What’s Under the Hood

This isn't a "hello world" app. Here is a look at the actual engineering involved:

| Area | What's Here |
| --- | --- |
| **Test Suite** | **1,166 tests** (476 frontend, 690 backend). These are real integration and unit tests, not placeholders. |
| **Streaming Uploads** | Zero-disk architecture. Files stream straight to the cloud with hash verification to prevent bottlenecks. |
| **Security Layers** | Hardened with RLS, Bearer auth, Origin allowlisting, and automated secret scanning. |
| **Background Jobs** | Uses **BullMQ + Redis** to handle thumbnails, AI processing, and HEIC conversion so the main thread never hangs. |
| **AI Pipeline** | Built with **LangGraph** workflows. It uses modular logic with built-in retries rather than messy, one-off API calls. |
| **HEIC Conversion** | Automatic conversion to JPEG via Sharp, with a heic-convert fallback. |

**Why bother?** Without this, you end up with a mess of API calls scattered everywhere. LangGraph keeps it organized and testable.

---

### ✨ Architectural Experiments & Features

#### 🧠 AI Photo Concierge (Prototype)

* **Unified Context Tab:** The EditPage was redesigned to stack the story description and map in a single view for better UX.
* **Detection:** It identifies dogs, food, and over 100 other categories.
* **Intelligent Logic:** It tries to cross-reference food photos with local restaurants via the Places API and can even estimate the value of collectibles (like Pyrex or comics).
* **Landscape Awareness:** The AI attempts to name specific landmarks, mountains, or lakes found in your shots.

#### 🏗️ Backend & Infrastructure

* **Zero-Disk Streaming:** Uploads go directly to Supabase Storage, skipping local disk limits.
* **Modular AI:** Using LangGraph to chain EXIF extraction, GPS lookups, and image analysis into a clean workflow.
* **Robust Processing:** BullMQ handles the heavy lifting in the background.
* **Data Safety:** Strict Postgres RLS ensures users can only ever touch their own data.

#### 🔒 Security (Experimental)

* **Bearer Auth:** API routes are locked down and require valid tokens.
* **Secure Media:** Prefers signed URLs for thumbnails to keep assets private.
* **Hardened Auth:** State-changing endpoints enforce strict Origin/Referer checks to stop CSRF without relying solely on tokens.
* **Hygiene:** Uses `npm run secret-scan` to make sure no keys ever accidentally hit the repo.

#### 💬 Chat & Notifications

* **Smart Tracking:** Unread counts are tracked per-room using `last_read_at`.
* **Context-Aware Popups:** If you’re already in a chat room, notifications for that room are silenced to stay out of your way.

---

### ✅ Engineering Standards

Here, "industry-leading" means:

* Thinking about threat models before writing code.
* Handling errors gracefully without leaking system info.
* Keeping documentation alive and in sync with the code.
* Watching for performance regressions during every refactor.

---

### 📸 Photo Handling

* **Optimistic Uploads:** The UI stays snappy; you can navigate away while the background workers handle the heavy lifting.
* **Smart Gallery:** Includes lazy loading, date-range filtering, and a compass overlay for map pins to show which way the camera was pointing.

---

### 🏗️ How the Upload Pipeline Works

**Why bother?** Most tutorials teach "save to disk, then upload." That creates bottlenecks. Streaming straight to cloud storage skips that problem entirely.

```
upload
  → stream to storage
  → enqueue background job
  → worker extracts EXIF, generates thumbnails
  → (optional) AI enrichment
```

1. **Stream:** Photo moves from user to Supabase Storage (zero local disk).
2. **Verify:** Integrity hash is calculated on the fly.
3. **Queue:** BullMQ picks up the job.
4. **Process:** Workers extract EXIF, make thumbnails, and trigger AI.
5. **Poll:** The frontend polls a single source of truth (Zustand store) until the job is done.

---

### 🚀 Quick Start (Local Dev)

**Prerequisites:** Node.js 20+, Docker (for Postgres/Redis).

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

# 5. Start development (3 separate terminals)
npm run dev           # Frontend
cd server && npm run dev # Backend
cd server && npm run worker # Background Worker

```

* **Frontend:** `http://localhost:5173`
* **Backend:** `http://localhost:3001`

Notes:

* The worker is required for thumbnail generation and background enrichment.
* If `Maps_API_KEY` / `GOOGLE_PLACES_API_KEY` is missing, Places-based enrichment will be disabled.
* In non-test environments, the backend is configured to refuse startup if `OPENAI_API_KEY` is missing.

---

### 📖 Docs & Further Reading

* [Development Notes (check-privilege)](docs/DEV.md)
* [Testing Guide](TESTING.md)
* [Roadmap](docs/ROADMAP.md)
* [Security Maintenance Checklist](docs/SECURITY_CODING_MAINTENANCE.md)
* [Backend README](server/README.md)
* [TypeScript Refactoring Candidates](./typescript-refactor-candidates.md) - Files flagged for TS conversion

---

### License

MIT - see [LICENSE](LICENSE)
