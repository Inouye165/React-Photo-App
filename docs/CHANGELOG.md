## [Unreleased]
Performance: Implemented client-side thumbnail generation to eliminate server-side resizing delays.
# Changelog

All notable changes to the React Photo App are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### In Progress
- Gallery view redesign for improved UX
- Mobile-responsive layouts
- Batch operations (multi-select, delete, re-analyze)

### Added
- **[Performance]** Storage Metadata Cache-Control (Phase 3) - All uploads to Supabase Storage now include `cacheControl: '31536000'` (1 year) metadata. Applies to both user-uploaded photos and generated thumbnails. Enables CDN and browser caching for immutable content-addressed files
- **[Performance]** API Payload Optimization - `GET /photos` list endpoint now returns a strict subset of columns, excluding heavy fields (`poi_analysis`, `ai_model_history`, `text_style`, `storage_path`, `edited_filename`). Detail view (`GET /photos/:id`) remains unchanged with full data. Reduces list payload size significantly for gallery views
- **[Performance]** Immutable Cache Headers (Phase 2) - Display routes now serve `Cache-Control: public, max-age=31536000, immutable` for aggressive browser caching. Eliminates 304 revalidation round-trips for hashed thumbnails and static images
- **[Performance]** Stable Signed URLs - Refactored URL signing to use 24-hour time windows aligned to UTC midnight. Signatures now remain stable within each window, enabling browser caching of signed thumbnail URLs (Phase 1 of caching optimization)

### Fixed
- Analyze action no longer removes the photo from the gallery; the card stays visible and shows `Analyzing...` while processing.

### Changed
- Migrated `PhotoCard` and `PhotoDetailPage` to TypeScript (`.tsx`) and aligned user-facing state labels (`Draft` / `Analyzing...` / `Analyzed`).

---

## [November 2025] - Security & Scalability Focus

### Added
- **[Reliability]** Enhanced Session Recovery - Invalid refresh tokens now trigger automatic cleanup and re-login prompt, preventing zombie sessions and "half-broken" authentication states
- **[Scalability]** Zero-Disk Streaming Uploads - Photo uploads now stream directly to Supabase Storage using Busboy, eliminating local `os.tmpdir()` disk writes. Hash calculation and validation occur during streaming. Heavy processing (EXIF extraction, thumbnails) deferred to BullMQ workers
- **[Security]** CSRF Protection - Token + Origin validation on all state-changing requests
- **[Security]** Concurrency Limits - Rate limiting prevents upload storms from overwhelming workers

### Fixed
- File cleanup race condition in `server/routes/uploads.js` - Properly handles cleanup in try-finally block, removing orphaned files from Supabase Storage when `ingestPhoto` fails
- Dependency conflicts resolved - `npm install` now works without flags

### Changed
- **[Security]** Enforced Bearer Token Authentication (API) - Protected API routes require `Authorization: Bearer <token>`. `/api/auth/session` and `/api/auth/logout` are deprecated/no-op.
- **[Security]** Token leakage eliminated - No tokens stored in localStorage or URL params.

---

## [October 2025] - Cloud-Native Architecture

### Added
- **[Security]** Strict SSL certificate validation for production database connections - Production now enforces `rejectUnauthorized: true` with CA certificate verification to prevent MITM attacks
- **[Security]** Complete Supabase Auth integration with centralized log redaction
- **[AI]** Advanced HEIC Support - Automatic conversion with Sharp and `heic-convert` fallback (no ImageMagick dependency)
- **[AI]** Dynamic model selection with failover
- **[Infrastructure]** Background processing with BullMQ and robust retry mechanisms
- **[Infrastructure]** Comprehensive test suite expanded to 86 tests covering frontend, backend, and security
- **[Features]** Location Intelligence - Google Places API integration for POI lookup
- **[Features]** Collectibles Valuation - AI estimates worth of memorabilia
- **[Features]** Food Detective Agent - Cross-references dishes with nearby restaurants using GPS

### Fixed
- "Split Brain" authentication resolved - Local `users` table removed, all user management consolidated on Supabase Auth

### Changed
- Supabase/local PostgreSQL became the backbone of the data layer (PostgreSQL required for all environments)
- Configuration management improved - environment variables, secrets, deployment scenarios carefully managed
- Content Security Policy (CSP) with Helmet introduced with dedicated CI tests

---

## [September 2025] - The 2025 Overhaul

### Added
- Backend-driven photo service architecture
- Photos as first-class records with metadata
- HEIC image handling
- Thumbnail generation for fast browsing
- Location data extraction from EXIF
- Async queue for AI processing (non-blocking uploads)
- Modular backend structure (routes, helpers, configuration)
- Automated tests and early CI pipeline

### Changed
- Transformed from course-style photo gallery into serious, backend-driven photo service
- Frontend became proper client consuming backend API
- Backend took responsibility for uploads and metadata

---

## Earlier Versions

Previous iterations served as learning vehicles for React and Node.js fundamentals. The September 2025 overhaul marked the transition to production-ready architecture.

See [PRODUCT_STORY.md](./PRODUCT_STORY.md) for the complete narrative journey.

---

**Note:** This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) principles, though version numbers are not yet formally assigned. Once a v1.0.0 release is tagged, this changelog will reflect version numbers accordingly.