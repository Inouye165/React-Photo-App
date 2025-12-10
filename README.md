

# React Photo App

![Status: High-Performance Engineering Prototype (Active Development)](https://img.shields.io/badge/status-high--performance--prototype-yellow.svg)
[![Tests](https://img.shields.io/badge/tests-700%2B%20passing-brightgreen.svg)](https://github.com/Inouye165/React-Photo-App)
[![Security](https://img.shields.io/badge/security-JWT%20%2B%20RLS-blue.svg)](https://supabase.com/docs/guides/auth)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **A production-grade backend and security architecture wrapped in a functional prototype UI.**

This repository demonstrates that a single developer can build a secure, scalable, AI-integrated photo platform. The backend features enterprise-grade architecture, robust security (RLS, CSRF, HttpOnly auth), and advanced AI workflows. The user interface is a functional draft—focusing on architecture over UI polish. Expect a utilitarian, developer-focused experience while the frontend evolves.

**Author:** Ron Inouye ([@Inouye165](https://github.com/Inouye165))

---

## 🎯 Why This Exists

After managing 15,000+ vacation photos and hitting the limits of commercial tools (slow HEIC conversion, vendor lock-in, no collectibles support), I set out to prove that modern web technologies can deliver production-grade security and backend architecture—even as a solo developer. Every architectural decision, from zero-disk streaming uploads to LangGraph AI orchestration, was made to solve real bottlenecks and deliver robust, scalable solutions.

This project is not a tutorial or a consumer-ready product. It is a high-performance engineering prototype: the backend and security are ready for real-world use, while the frontend remains a functional draft. The goal is to showcase backend and AI engineering, with UI polish coming later.

**Read the full journey:** [Product Story](docs/PRODUCT_STORY.md) (Sept–Nov 2025)

---

## ✨ Architectural Experiments & Features

### 🧠 **AI Photo Concierge (Prototype)**
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
- **httpOnly Cookie Auth:** JWT tokens never touch browser localStorage or URL params
- **CSRF Protection:** Token + Origin validation on every state-changing request
- **Content Security Policy:** Helmet-enforced CSP with automated CI tests
- **Concurrency Limits:** Rate limiting to prevent upload storms

### 📸 **Photo Handling**
- **HEIC Auto-Convert:** Sharp + ImageMagick fallback for Apple's HEIC format
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

**Why this matters:** Traditional apps write to disk, process, then upload—creating I/O bottlenecks under load. Streaming directly to cloud storage eliminates this entirely.

### The AI Brain (LangGraph)
```
Photo ingested
  → Extract EXIF (camera, GPS, timestamp)
  → Fetch POIs from Google Places (restaurants, parks, landmarks)
  → Analyze image content (objects, scene, quality)
  → If collectible: estimate value
  → If food + GPS: match likely restaurant
  → Generate rich description with location context
```

**Why this matters:** Instead of scattered API calls, LangGraph creates a clear, testable workflow with retry logic and fallbacks.

---

## 📊 Pipeline Visualization

Understanding the AI decision-making process is crucial for debugging and transparency. We maintain detailed flowcharts for our LangGraph pipelines.

### Available Workflows
- **Collectibles & Valuation:** [View Flowchart](https://www.mermaidchart.com/app/projects/3987fe3a-7a87-4a8e-88aa-f8f67641a1c8/diagrams/40b55f2f-dde6-4165-bb1d-51a9cd381eb3/share/invite/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkb2N1bWVudElEIjoiNDBiNTVmMmYtZGRlNi00MTY1LWJiMWQtNTFhOWNkMzgxZWIzIiwiYWNjZXNzIjoiRWRpdCIsImlhdCI6MTc2NDUxMzEwN30.b4x8ODds4lnoiSOsPSqBGbnGotzegAomf14DMbOroWM)
  *(Interactive diagram hosted on Mermaid Chart)*
  *Visualizes the logic for identifying collectible items, assessing condition, and estimating market value.*

*(More pipeline visualizations for Food/Scenery coming soon)*

---

## 🔐 Authentication & Password Reset

The application uses Supabase for authentication.

### Password Reset Flow
The password reset flow is handled by the `/reset-password` route.
1. User requests password reset via "Forgot Password" link.
2. Supabase sends an email with a link to `/reset-password`.
3. User enters new password.
4. App updates password in Supabase and syncs session with backend.

**Configuration:**
Ensure your Supabase project has the following Redirect URLs configured:
- `https://react-photo-app-eta.vercel.app/reset-password`
- `http://localhost:5173/reset-password` (for local development)


## 🚀 Quick Start

### Prerequisites
- **Node.js 20+**
- **Docker** (for local Postgres and Redis)
- **docker-compose** (recommended for local DB/Redis)
- **Supabase account** (for production or hosted Postgres/Storage/Auth)
- **Redis** (local: `docker-compose up -d redis` or `docker run -d -p 6379:6379 redis:7.2-alpine`)
- **ImageMagick** (for HEIC fallback)

### Installation & Setup

```bash
# 1. Clone and install dependencies
git clone https://github.com/Inouye165/React-Photo-App.git
cd React-Photo-App
npm install
cd server && npm install && cd ..

# 2. Start required services (local dev)
docker-compose up -d db redis

# 3. Configure environment variables
cp server/.env.example server/.env
# Edit server/.env with your Supabase/Postgres/Redis credentials
# At minimum, set one of:
#   SUPABASE_DB_URL or DATABASE_URL (Postgres connection string)
#   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 4. Run migrations
cd server && npm run migrate && cd ..

# 5. Start the app (in separate terminals)
npm run dev                # Terminal 1: Frontend (Vite, port 5173)
cd server && npm start     # Terminal 2: Backend API (port 3001)
cd server && npm run worker # Terminal 3: AI Worker (requires Redis & DB)
```

**Frontend:** http://localhost:5173  
**Backend API:** http://localhost:3001

> **Note:** The AI worker (`npm run worker`) is required for background photo analysis and enrichment. If `GOOGLE_MAPS_API_KEY` is missing, Places-based enrichment will be disabled but uploads and basic analysis will still work.

---

## ⚙️ Environment Variables

Edit `server/.env` (see `server/.env.example` for all options). **Required** variables:

- `SUPABASE_DB_URL` or `DATABASE_URL` – Postgres connection string (local or Supabase)
- `SUPABASE_URL` – Supabase project URL
- `SUPABASE_ANON_KEY` – Supabase anon public key
- `SUPABASE_SERVICE_ROLE_KEY` – Supabase service role key (server-side only)

**Optional:**
- `GOOGLE_MAPS_API_KEY` – Enables Google Places enrichment (optional; if missing, POI lookups are skipped)
- `OPENAI_API_KEY` – Required for AI features (see `server/.env.example` for more)

---

## 🏃 Running in Development

Start each service in its own terminal:

```bash
# 1. Frontend (Vite, port 5173)
npm run dev

# 2. Backend API (Express, port 3001)
cd server && npm start

# 3. AI Worker (background jobs)
cd server && npm run worker
```

**Ports:**
- Frontend: `5173`
- Backend API: `3001`
- Postgres (Docker): `5432`
- Redis (Docker): `6379`

---

## 🔐 Auth & Security

- **Authentication:** Cookie-based (httpOnly) JWT tokens; never stored in localStorage or URL params.
- **Row-Level Security:** Supabase RLS is enforced for all user data isolation.
- **CSRF Protection:** All state-changing requests require CSRF tokens and Origin validation.

---

**Visit:** `http://localhost:5173`
## 🛠️ Tech Stack

**Frontend:** React 19, Vite, Tailwind CSS, Zustand, React Testing Library  
**Backend:** Node.js, Express, Supabase (Postgres + Storage + Auth), BullMQ, Redis  
**AI/Processing:** LangGraph, Sharp, ImageMagick, Google Places API  
**Security:** Helmet, JWT (httpOnly cookies), RLS, CSRF tokens  
**Testing:** Vitest, Jest, Supertest (700+ tests across frontend & backend, 20x stress-tested)

---

## 📋 Features in Action

![AI Photo Analysis](docs/screenshots/edit_page.png)
*AI-generated description identifies subjects (bison), location context (Mud Volcano Trailhead, Yellowstone), and nearby points of interest—all from EXIF data and image analysis*

### Photo Intelligence
- Upload any photo → AI describes contents automatically
- GPS-tagged photos → Pin on map + nearby POI markers
- Food photos → "Seafood boil from Cajun Crack'n, Concord CA"
- Collectibles → "Vintage Pyrex Butterprint bowl, est. $45-$60"
- Wildlife/Nature → "Bison grazing near Mud Volcano Trailhead, Yellowstone"

### Developer Experience
- **Modular codebase:** Clear separation (routes, services, workers)
- **Comprehensive tests:** Frontend + backend + security (see [TESTING.md](TESTING.md))
- **Migration system:** SQL migrations with rollback support
- **Stress tested:** 20x runs to catch race conditions

---

## 📚 Documentation

- **[TESTING.md](TESTING.md)** - Test suite guide (unit, integration, stress tests)
- **[TOOLS_AND_TESTS.md](docs/TOOLS_AND_TESTS.md)** - Reference for all scripts, tools, and environment verification utilities
- **[PRODUCT_STORY.md](docs/PRODUCT_STORY.md)** - Engineering journey (Sept–Nov 2025)
- **[CHANGELOG.md](docs/CHANGELOG.md)** - Release history and recent updates
- **[ROADMAP.md](docs/ROADMAP.md)** - Planned features and known limitations
- **[CONTRIBUTING.md](docs/CONTRIBUTING.md)** - How to report bugs and suggest features
- **[server/README.md](server/README.md)** - Backend architecture and API docs
- **[server/ai/README.md](server/ai/README.md)** - AI service documentation (POI detection, LangGraph workflows)

---

## 🧪 Quality Assurance

```bash
# Run all tests (700+ passing across frontend & backend)
npm run test:run

# Backend only
cd server && npm test

# Stress test (detect race conditions)
npm run test:stress -- --runs 50
```

**CI Pipeline:** Every push runs unit tests, integration tests, CSP validation, and security scans.

---

## 🚢 Deployment

Currently designed for self-hosted deployment to:
- **Railway** (recommended: automatic Redis + Node.js for backend)
- **Vercel** (frontend hosting, deployed at `https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app`)
- **Supabase + VPS** (backend on DigitalOcean/AWS, DB on Supabase)
- **Docker Compose** (all services containerized)

### Frontend/Backend CORS Configuration

When deploying the frontend to Vercel (or Netlify) and the backend to Railway, configure CORS via the `FRONTEND_ORIGIN` environment variable on the backend:

```bash
# On Railway backend
FRONTEND_ORIGIN=https://your-app.vercel.app
```

This ensures cross-origin cookie-based authentication works correctly. See `server/README.md` for full CORS configuration options.

**Environment:** Production requires Supabase Postgres, Redis, and object storage. See `server/.env.example` for required variables.

---

## 📍 Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for:
- Planned features (multi-user sharing, mobile app, advanced search)
- Known limitations (UI polish in progress, English-only AI)
- Performance targets (1000+ photos tested, 10K+ planned)

---

## 🤝 Contributing

This is a personal learning project, but I welcome bug reports and feature suggestions!

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines on:
- Reporting bugs
- Suggesting features (especially collectibles/photography workflows)
- Submitting pull requests

**Please read:** [TESTING.md](TESTING.md) before submitting PRs (tests must pass).

---

## 🔐 Security & Dependencies

Security is a core design principle. For details on authentication architecture, dependency audits, and any temporary security measures, see [SECURITY_REMEDIATION_SUMMARY.md](./SECURITY_REMEDIATION_SUMMARY.md).

---

## 📜 License

MIT License - see [LICENSE](LICENSE)

---

## 🙏 Acknowledgments

Built with:
- **Supabase** for managed Postgres + Auth + Storage
- **Sharp/ImageMagick** for image processing
- **BullMQ** for reliable background jobs
- **LangGraph** for AI workflow orchestration

Inspired by real frustrations with commercial photo apps and a desire to prove that indie developers can build enterprise-quality software.

---

**Questions?** Open an issue or reach out via [GitHub](https://github.com/Inouye165).

**Like what you see?** Star the repo ⭐ and check out the [Product Story](docs/PRODUCT_STORY.md) to see how it evolved.