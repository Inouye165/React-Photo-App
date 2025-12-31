# TypeScript Refactoring Candidates

This document tracks files that have been identified as candidates for conversion to TypeScript.

## Candidates

Counts track how often a file has been flagged/touched as TypeScript migration-worthy.

| File | Count | Why |
| --- | ---: | --- |
| `server/config/allowedOrigins.js` | 1 | Origin normalization/allowlist behavior is security-sensitive; TS helps prevent regression. |
| `server/middleware/auth.js` | 2 | High-complexity security logic (JWT verification + issuer canonicalization + Supabase user resolution + E2E gates). |
| `server/lib/redis.js` | 1 | Core caching utility with version-sensitive client APIs; TS would help keep the wrapper correct. |
| `src/App.jsx` | 2 | Routing is security-critical; consider migrating to TypeScript/TSX for safer route composition. Touched for admin route. |
| `src/components/SmartRouter.jsx` | 1 | Contains auth/onboarding routing logic; consider migrating to TypeScript/TSX. |
| `src/components/AppHeader.jsx` | 1 | Navigation component with role-based UI (admin badge); TypeScript would improve type safety for user metadata. |

- [ ] (Add files here)

## Deprecation Tracking

| Area | Package | Why it matters | Action |
| --- | --- | --- | --- |
| `server/package.json` | `csurf` | `csurf` is deprecated but still used for CSRF protection; it pulls `cookie` transitively, so security updates can get blocked and require overrides (e.g., CVE-2024-47764 remediation). | Replace with a maintained CSRF strategy for Express (e.g., double-submit cookie or a maintained CSRF middleware/library) and remove the legacy dependency. |
