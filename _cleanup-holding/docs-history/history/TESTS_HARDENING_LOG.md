> Historical note: This is a point-in-time log. Paths, scripts, or auth models may not match the current main branch.

# TESTS_HARDENING_LOG.md

## [2025-11-06] Phase-1 Hardening - Complete

**What changed:**
- **Routing Architecture Refactor:**
  - Refactored Express routers to router-root pattern with proper mounting
  - Health router at `/health`, photos at `/photos`, display at root
  - Created dedicated `display.js` router for image serving endpoints
  - Added global JSON 404 handler for unmatched routes
  
- **Comprehensive Test Suite (246 total tests):**
  - Backend: 173 passing tests (28 test suites)
  - Frontend: 73 passing tests (10 test suites)
  - OpenAPI contract validation
  - ETag/304 caching tests
  - Security: CSP, rate limiting, auth/RBAC
  - Error handling: downstream errors, log redaction
  - Upload limits and validation
  - Environment variable validation
  
- **Test Infrastructure:**
  - Fixed cache.etag.test.js with proper Supabase mocks and test data
  - Fixed photos-state.test.js paths to match router-root patterns
  - Added 401 Unauthorized response to OpenAPI spec
  - Excluded e2e tests from Vitest configuration
  - Created placeholder e2e/perf/docker test files for future implementation
  
- **CI/CD:**
  - Updated GitHub Actions workflow
  - Temporarily disabled incomplete tests (e2e, perf, docker smoke)
  - Core tests (lint, build, unit, integration) all passing

**Diffs summary:**
- Edited: server/server.js (router mounting, JSON 404 handler)
- Edited: server/routes/health.js (router-root pattern)
- Edited: server/routes/photos.js (router-root pattern, AI endpoints)
- Edited: server/routes/uploads.js (upload limits)
- Added: server/routes/display.js (dedicated display router)
- Added: server/openapi.yml (API contract specification)
- Added: server/config/env.validate.js (environment validation)
- Added: server/tests/contract.openapi.test.js
- Added: server/tests/cache.etag.test.js
- Added: server/tests/display.cache.test.js
- Added: server/tests/csp.prod.test.js
- Added: server/tests/uploads.limits.test.js
- Added: server/tests/ratelimit.test.js
- Added: server/tests/ratelimit.headers.test.js
- Added: server/tests/auth.rbac.test.js
- Added: server/tests/errors.downstream.test.js
- Added: server/tests/logs.redaction.test.js
- Added: server/tests/env.validate.test.js
- Edited: server/tests/photos-state.test.js (path updates)
- Added: server/playwright.config.js (e2e test config)
- Edited: vitest.config.js (exclude e2e tests)
- Edited: scripts/docker-smoke.js (lint fix)
- Added: e2e/smoke.spec.ts, e2e/a11y.gallery.spec.ts, e2e/a11y.upload.spec.ts
- Added: perf/smoke.js (k6 performance test)
- Edited: .env.example (UPLOAD_MAX_BYTES docs)
- Edited: .github/workflows/ci.yml (test jobs, conditional execution)
- Added: TESTS_HARDENING_LOG.md

**Commands run + key outputs:**
- `npm test` (server): 173/173 passing, 28/28 suites passing
- `npm test` (root): 73/73 passing, 10/10 suites passing  
- `npm run lint`: Clean, no errors
- Total: 246 passing tests, 100% success rate

**Lessons learned:**
- Express router mounting: use router-root paths with explicit mounting prefixes
- Test isolation: mock Supabase Storage and seed test data in beforeAll()
- OpenAPI validation: ensure specs match actual behavior including error responses
- Vitest configuration: explicitly exclude non-unit test directories (e2e, perf)
- CI/CD: use conditional job execution for incomplete infrastructure
- Husky errors in CI: use `.npmrc` with `ignore-scripts=true` in sub-packages to prevent root lifecycle scripts from breaking installs
- Native modules in CI: ensure native bindings (e.g., `sqlite3`) are rebuilt or installed correctly after dependency install, especially when using `ignore-scripts` or monorepo setups
- Strict CSP regression test is essential for production security
- Upload limits and error hygiene prevent resource exhaustion and info leaks
- Log redaction must be verified to avoid accidental secret exposure

---
