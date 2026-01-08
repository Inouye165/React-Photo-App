# TypeScript Refactoring Candidates

This document tracks files that have been identified as candidates for conversion to TypeScript.

## Recently Converted

| File | Converted To | Date |
| --- | --- | --- |
| `src/components/AppHeader.jsx` | `src/components/AppHeader.tsx` | 2026-01-08 |
| `src/Toolbar.jsx` | `src/Toolbar.tsx` | 2026-01-08 |
| `src/layouts/MainLayout.jsx` | `src/layouts/MainLayout.tsx` | 2026-01-08 |

## Candidates

Counts track how often a file has been flagged/touched as TypeScript migration-worthy.

| File | Count | Why |
| --- | ---: | --- |
| `server/config/allowedOrigins.js` | 1 | Origin normalization/allowlist behavior is security-sensitive; TS helps prevent regression. |
| `server/middleware/auth.js` | 2 | High-complexity security logic (JWT verification + issuer canonicalization + Supabase user resolution + E2E gates). |
| `server/lib/redis.js` | 1 | Core caching utility with version-sensitive client APIs; TS would help keep the wrapper correct. |
| `server/routes/admin.js` | 1 | Admin endpoints are security-sensitive (RBAC + query validation); TypeScript would improve safety and consistency. |
| `server/ai/langgraph/nodes/confirm_collectible.js` | 2 | HITL gate with user input sanitization and state validation; TypeScript would improve type safety for collectible state management. |
| `server/services/photosDb.js` | 1 | Modified during HITL bug fix; critical path logic. Contains database query resolution with UUID/numeric fallback logic. |
| `src/pages/PhotoEditPage.jsx` | 1 | Modified during HITL bug fix; critical path logic. Contains photo editing workflow with AI polling and state management. |
| `server/routes/photos.js` | 2 | Modified during HITL bug fix and Accept flow optimization; critical path logic. Contains recheck-ai endpoint with Human Override detection and conditional metadata extraction logic. Complex async/await flow with error handling. |

- [ ] (Add files here)

## Deprecation Tracking

| Area | Package | Why it matters | Action |
| --- | --- | --- | --- |
| `server/package.json` | `csurf` | `csurf` is deprecated but still used for CSRF protection; it pulls `cookie` transitively, so security updates can get blocked and require overrides (e.g., CVE-2024-47764 remediation). | Replace with a maintained CSRF strategy for Express (e.g., double-submit cookie or a maintained CSRF middleware/library) and remove the legacy dependency. |
