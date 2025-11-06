# TESTS_HARDENING_LOG.md

## [2025-11-06] Phase-1 Hardening

**What changed:**
- Enforced upload size limit (UPLOAD_MAX_BYTES, default 10MB) in upload middleware
- Added tests for prod CSP, upload limits, rate limiting, auth/RBAC, downstream error hygiene, and log redaction
- Documented UPLOAD_MAX_BYTES in .env.example
- Added CI job for prod CSP regression

**Diffs summary:**
- Edited: server/routes/uploads.js
- Added: server/tests/csp.prod.test.js
- Added: server/tests/uploads.limits.test.js
- Added: server/tests/ratelimit.test.js
- Added: server/tests/auth.rbac.test.js
- Added: server/tests/errors.downstream.test.js
- Added: server/tests/logs.redaction.test.js
- Edited: .env.example
- Edited: .github/workflows/ci.yml
- Added: TESTS_HARDENING_LOG.md

**Commands run + key outputs:**
- npm test -i (see below for summary)

**Lessons learned:**
- Strict CSP regression test is essential for production security
- Upload limits and error hygiene prevent resource exhaustion and info leaks
- Log redaction must be verified to avoid accidental secret exposure

---
