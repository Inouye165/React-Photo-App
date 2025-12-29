# TypeScript Refactoring Candidates

This document tracks files that have been identified as candidates for conversion to TypeScript.

## Candidates

- `server/config/allowedOrigins.js` (recently edited): consider migrating to TypeScript to keep origin normalization/allowlist behavior type-safe.

- `server/middleware/auth.js`: high-complexity security logic (JWT verification + Supabase user resolution + E2E gates); TypeScript would reduce auth regressions.
- `server/lib/redis.js`: core caching utility with version-sensitive client APIs; TypeScript would help keep the wrapper correct.

- `src/App.jsx` (recently edited): routing is security-critical; consider migrating to TypeScript/TSX for safer route composition.
- `src/components/SmartRouter.jsx` (recently edited): contains auth/onboarding routing logic; consider migrating to TypeScript/TSX.

- [ ] (Add files here)
