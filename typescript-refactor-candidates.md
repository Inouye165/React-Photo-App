# TypeScript Refactoring Candidates

This document tracks files that have been identified as candidates for conversion to TypeScript.

## Candidates

Counts track how often a file has been flagged/touched as TypeScript migration-worthy.

| File | Count | Why |
| --- | ---: | --- |
| `server/config/allowedOrigins.js` | 1 | Origin normalization/allowlist behavior is security-sensitive; TS helps prevent regression. |
| `server/middleware/auth.js` | 2 | High-complexity security logic (JWT verification + issuer canonicalization + Supabase user resolution + E2E gates). |
| `server/lib/redis.js` | 1 | Core caching utility with version-sensitive client APIs; TS would help keep the wrapper correct. |
| `src/App.jsx` | 1 | Routing is security-critical; consider migrating to TypeScript/TSX for safer route composition. |
| `src/components/SmartRouter.jsx` | 1 | Contains auth/onboarding routing logic; consider migrating to TypeScript/TSX. |

- [ ] (Add files here)
