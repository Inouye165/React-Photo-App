<!-- docs/ENGINEERING_CASE_STUDY.md -->

> Historical note: This is a point-in-time case study. Paths, scripts, and auth models may not match the current main branch.

# Lumina – Engineering Case Study (Sept–Nov 2025)

## Overview

Between **late September 2025** and **late November 2025**, this project evolved from a refactored course-style photo app into a **production-grade, AI-powered, security-hardened platform**.

Key characteristics of the current system:

- **Backend:** Node.js / Express with Supabase Postgres in production
- **Frontend:** React with modern state management and routing
- **AI Pipeline:** OpenAI SDK orchestrated with LangGraph
- **Domains:** Photo archiving, collectibles valuation, food/restaurant detection, location intelligence
- **Operational Maturity:** Strong automated checks, security-by-design, cloud-native configuration

This document walks through the major engineering milestones in chronological order and highlights the core improvements at each stage.

---

## Timeline & Major Milestones

### 1. Repo Foundations & 2025 Overhaul  
**Approx. Sept 30, 2025**

**Goals**

- Rebuild the earlier course project as a real, backend-driven photo service.
- Establish a foundation that can scale, be tested, and be deployed cleanly.

**Key changes**

- Created a fresh repository and **“2025 overhaul”** commit.
- Implemented a **Node/Express backend** to:
  - Own file uploads and storage.
  - Track photo metadata and simple state (e.g., working / in-progress / staged).
- Updated the React frontend to:
  - Consume backend APIs for photo lists.
  - Use full backend URLs for image and thumbnail retrieval.

**Impact**

- Shifted the app from a “frontend toy” into a **true client–server architecture**.
- Laid the groundwork for future authentication, AI pipeline integration, and multi-user support.

---

### 2. HEIC Support, Location Metadata & Modular Server  
**Approx. Oct 1–17, 2025**

**Goals**

- Support real-world image formats (e.g., iPhone HEIC).
- Start enriching AI prompts with location context.
- Make the server testable and maintainable.

**Key changes**

- Added **HEIC image handling** and thumbnail generation:
  - Introduced image processing pipeline for large, modern image formats.
- Implemented early **location-aware helpers**:
  - Utilities using Nominatim / Overpass for reverse geocoding and nearby POI.
  - Prompt enrichment for AI that includes place/region hints.
- Refactored the Express server into **modular components**:
  - Routes, middleware, and config separated into clearer modules.
  - Initial backend test coverage and CI integration for server behavior.

**Impact**

- The app became robust against real photo workflows (e.g., mobile uploads).
- Foundations laid for later **location intelligence** and mapping features.
- Server codebase became more maintainable and **amenable to unit/integration tests**.

---

### 3. Async AI Queue & Operational Discipline  
**Approx. Oct 21–28, 2025**

**Goals**

- Prevent AI latency from blocking uploads.
- Begin treating the system as a long-running service under load.

**Key changes**

- Introduced **BullMQ-based async AI pipeline**:
  - Upload API enqueues AI work instead of waiting synchronously.
  - Worker process consumes jobs and applies AI classification / metadata extraction.
- Enhanced UX:
  - Clearer photo state and privilege-based filtering in the UI.
- Created **operational documentation**:
  - Behavior of HEIC fallback paths.
  - Migrations and AI processing semantics under load.

**Impact**

- Uploads became **resilient and responsive**, even under heavy AI processing.
- System behavior became more predictable and documented for future debugging and scaling.

---

### 4. Supabase Integration, CSP & Cloud-Ready Infra  
**Approx. Nov 4–11, 2025**

**Goals**

- Move toward a cloud-native, multi-environment deployment model.
- Strengthen browser-side security with CSP and Helmet.
- Stabilize CI in a clean Linux environment.

**Key changes**

- **Supabase Postgres + Storage** integration:
  - Supabase Postgres set as primary DB for production.
  - PostgreSQL used for all environments (no SQLite fallback).
  - Environment variables (`SUPABASE_*`) wired through server, CI, and tests.
- **Env-aware Helmet & CSP**:
  - Strict CSP for production builds.
  - Development/test modes relaxed for DX but still realistic.
  - Separate “CSP prod test” CI job using custom sharp build flags and test envs.
- CI & tooling improvements:
  - Fixed issues with native modules (e.g., `sharp`) on Linux runners.
  - Managed Husky hooks, caching, and script consistency for reproducible CI runs.

**Impact**

- Backend became **cloud-native and environment-aware**.
- Strong **browser security** posture via CSP and Helmet.
- CI became capable of running the full stack (including CSP checks) on a clean runner.

---

### 5. Collectibles Domain, Places API & LangGraph  
**Approx. Nov 11–18, 2025**

**Goals**

- Extend the app to support collectibles with AI valuation.
- Build a rich location-intelligence layer using external POI data.
- Replace ad-hoc AI orchestration with LangGraph.

#### Collectibles Feature (Around Nov 11, 2025)

**Key changes**

- Introduced a **collectibles domain**:
  - DB migrations for collectibles tables (e.g., Pyrex, comics, other assets).
  - API endpoints for creating, reading, and updating collectibles entries.
- Wired collectibles into the **AI valuation pipeline**:
  - Structured metadata (pattern, condition, etc.) fed into model prompts.
- Added tests and docs around the migration path and production behavior.

#### Places API & POI System (Around Nov 13–14, 2025)

**Key changes**

- Integrated a **Places API**:
  - Fetches nearby restaurants / POIs for given coordinates.
  - Configurable search radius and categories.
- Implemented a **POI cache**:
  - Map from location → POI data to avoid repeated calls.
- Strengthened logging:
  - Clear logs for Places requests, fallbacks, and failures.

#### LangGraph AI Orchestration (Nov 11–18, 2025)

**Key changes**

- Introduced **LangGraph**:
  - Replaced older LangChain-style chains with a structured state machine.
  - Nodes included `collect_context`, AI nodes, and POI fetch nodes.
- Centralized AI prompts and tools:
  - Prompts extracted to dedicated modules.
  - Graph tests and debug flows added to validate behavior.
- Removed legacy LangChain scaffolding to reduce dependency surface.

**Impact**

- The AI layer evolved from generic captioning into **domain-aware intelligence**:
  - Collectibles valuation.
  - Location-aware metadata.
- LangGraph provided **predictable, testable orchestration** with clear node boundaries.
- Performance and reliability improved via POI caching and detailed logging.

---

### 6. Food Detective Agent, RLS, CSRF & Cookie-Only Auth  
**Approx. Nov 17–23, 2025**

**Goals**

- Specialize the AI into a “food + restaurant” expert.
- Harden multi-tenant security at both DB and HTTP layers.
- Move to best-practice web security patterns.

#### Food Metadata / Restaurant “Detective” Agent (Nov 17–19, 2025)

**Key changes**

- Created a **Food Detective agent**:
  - Dedicated prompts for identifying dish type from an image.
  - Cross-references **nearby restaurants** (via Places) to guess origin.
- Improved POI/food logic:
  - Config-driven radius and category filters.
  - More structured `metadataForPrompt` to reduce hallucinations.

#### Database Security with RLS (Around Nov 21, 2025)

**Key changes**

- Enabled **Row Level Security (RLS)** on key tables (Postgres).
- Scoped rows to user identity to prevent cross-tenant data access.
- Guarded RLS configuration to only apply where Postgres is actually used.

#### CSRF Protection & Cookie-Only Auth (Nov 21–23, 2025)

**Key changes**

- Implemented **Synchronizer Token Pattern** for CSRF:
  - Token generation at registration/session creation.
  - Origin validation and CSRF token verification for state-changing routes.
  - Integration tests that include `Origin` headers and token handling.
- Migrated to **httpOnly cookie-based auth**:
  - Removed token-in-query patterns for image access.
  - Hardened image endpoints to enforce cookie authentication.

**Impact**

- Database is now **multi-tenant safe** via RLS.
- HTTP-facing endpoints are protected by **CSRF and cookie-based auth**, reducing risk of token leakage and cross-site attacks.
- Food-specific AI behavior became more accurate and explainable.

---

### 7. Final Hardening: Concurrency, DoS Protection & CI Flake Cleanup  
**Approx. Nov 24–25, 2025**

**Goals**

- Protect the server from upload-related DoS scenarios and race conditions.
- Make CI fully reliable and boring.
- Replace fragile security patterns with well-understood primitives.

**Key changes**

- **Concurrency / DoS protection**:
  - Added concurrency limits for image processing to prevent a single user from saturating resources.
  - Fixed race conditions and double-deletion issues in upload cleanup logic.
- **Security middleware cleanup**:
  - Removed fragile regex-based “mini-WAF.”
  - Relied instead on:
    - Helmet.
    - Rate limiting (where applicable).
    - Strict path sanitization and realpath checks for file access.
    - Well-structured CORS and body parsing configuration.
- **CI flake fixes**:
  - Addressed ENOENT errors by ensuring test temp files are created and cleaned deterministically.
  - Avoided ECONNRESET by consuming streams in Supabase mocks.
  - Tamed LangGraph/LangChain ESM import issues with targeted mocks.
  - Ensured all core tests run reliably in GitHub Actions.

**Impact**

- The app is now **operationally robust** under concurrent usage and adversarial patterns.
- CI is dependable, capturing regressions without random noise.
- Security posture is **layered, justifiable, and well-documented**.

---

## Before & After (Engineer’s View)

### Early October 2025

- New backend-driven photo app.
- HEIC support + basic AI hints.
- Initial tests and CI pipeline.
- Security mostly based on typical Express defaults.

### Late November 2025 (Current State)

- **Cloud-native** architecture with Supabase Postgres and storage.
- **Async AI pipeline** orchestrated via LangGraph with multiple domain-specific agents.
- **Defense in depth**:
  - HTTP-only cookies (legacy/transition use only).
  - CSRF defenses via strict Origin/Referer verification (no CSRF tokens).
  - CSP via Helmet.
  - RLS in Postgres.
  - Path sanitization, CORS, and safe logging.
- **Mature automated checks**:
  - Separate jobs for client, server, CSP tests, and security scanning.
  - Stable tests (including AI and Supabase integrations) with clear mocks and fixtures.

Lumina has effectively grown into a **small, production-ready SaaS-style platform** with engineering practices comparable to what you’d expect at industry-leading engineering organizations.

---

### 10. The "Split Personality" Database Connection Issue
**Dec 8, 2025**

**The Problem**
The application exhibited a "Split Personality" behavior where it behaved like two completely different applications depending on the entry point:
- **Personality A (`node server.js`):** The main server started successfully. It correctly identified the environment as `development`, used relaxed security settings (no strict SSL), and connected to the database without issues.
- **Personality B (`npm start` -> `check-migrations.js`):** The pre-start migration check failed immediately with a misleading error: `Knex: Timeout acquiring a connection. The pool is probably full.`

**Root Cause Analysis**
The root cause was **configuration drift** between the main server and the helper scripts, compounded by a misleading error message.

1. **The "Trap" in `check-migrations.js`:** The migration script contained logic intended to "auto-detect" a production environment. If it detected a `SUPABASE_DB_URL` in the environment variables, it forcibly switched the configuration to `production` mode, even if `NODE_ENV` was set to `development`.
   - **Production Mode:** Enforces strict SSL verification (requires CA certificates) and expects a cloud environment.
   - **Development Mode:** Allows self-signed certificates and relaxed SSL settings suitable for local development.
   
   Because the user had added `SUPABASE_DB_URL` to their local `.env` file (to work with the remote DB), the script triggered this trap, tried to enforce strict SSL on a local machine, failed to connect, and timed out.

2. **The Misleading Error:** The error `Timeout acquiring a connection. The pool is probably full` was a red herring. The pool wasn't full; the pool **could not create a single valid connection** because of the SSL/DNS mismatch. Knex reported this as a timeout waiting for a resource.

3. **The DNS Factor:** Further diagnostics revealed that the direct database endpoint (`db.xcidibfijzyoyliyclug.supabase.co`) was failing DNS resolution (`ENOTFOUND`) on the local network, while the connection pooler endpoint (`aws-1-us-east-1.pooler.supabase.com`) was reachable. The configuration priority favored the direct URL, causing failures even when a valid alternative existed.

**The Fix**
We implemented a multi-layered fix to ensure consistency and reliability:
1. **Unified Logic:** We removed the "auto-detect" trap from `check-migrations.js`. It now respects `NODE_ENV` exactly like the main server does.
2. **Connection Priority:** We updated `knexfile.js` to prefer the **Supabase Pooler URL** over the Direct URL. The pooler (port 6543) is more reliable for client connections than the direct Postgres port (5432) in this context.
3. **Better Diagnostics:** We added a "pre-flight" connection check to `check-migrations.js` using a raw `pg` client. This bypasses Knex's pool logic to report the *actual* error (e.g., `ENOTFOUND`, `ECONNREFUSED`, `SSL Error`) instead of a generic timeout.

**Lessons Learned**
- **Single Source of Truth:** Helper scripts (migrations, seeds, tests) must share the *exact same* configuration logic as the main application. Never duplicate environment detection logic.
- **Don't Trust Generic Errors:** "Timeout" often means "Unreachable," not "Busy." Always verify basic connectivity (ping, DNS) before tuning pool sizes.
- **Local != Production:** Just because you are connecting to a production database (Supabase) doesn't mean your *runtime environment* is production. Your local machine is still a development environment.

