# Security coding & maintenance

This project treats security as part of everyday engineering work: making changes safely, keeping dependencies current, and documenting trade-offs. This doc is intentionally practical — it’s the checklist I use when I touch auth, uploads, image serving, or anything that could impact user data isolation.

## The security “shape” of this app

- The frontend uses Supabase for user sessions.
- The backend is an Express API that expects `Authorization: Bearer <token>` for protected routes.
- Image delivery is a special case because browsers don’t let `<img>` tags send custom headers. The preferred approach is signed thumbnail URLs; Bearer auth is also supported for programmatic fetches.
- Some legacy cookie-based image access still exists as a temporary compatibility path and should be treated as deprecated.

## Before you code

- Decide what user boundary you’re working within (single user, multi-user isolation, admin-only behavior).
- Treat “derived data” (thumbnails, AI output, EXIF, GPS) as user data. It needs the same access controls.
- Confirm how the change impacts:
  - Authentication (Bearer token flow)
  - Authorization (ownership checks / least privilege)
  - Storage access (Supabase Storage paths and permissions)
  - Logging (no secrets, no tokens, no private EXIF)

## Everyday checks (fast)

Run these locally before opening a PR:

```bash
# secret-like strings / accidental key commits
npm run secret-scan

# privilege / ownership checks (repo script)
npm run check-privilege

# lint + basic hygiene checks
npm run lint

# web tests
npm run test:run

# server tests
cd server && npm test
```

If you’re changing anything in the server auth/image stack, prefer to run the server test suite even if the change feels “small”.

## Dependency maintenance

- Keep dependencies current, but do it deliberately:
  - Update one major dependency at a time when possible.
  - Read the changelog for auth/security libraries (Supabase client, Helmet, jsonwebtoken, express-rate-limit, zod).
- Watch for “security regressions by upgrade” (changed defaults, stricter parsing, different CORS behavior).
- When updating dependencies, run at least:
  - `npm run test:run`
  - `cd server && npm test`

## Secrets & environment hygiene

- Never commit secrets. Use `.env` locally and platform-managed secrets in production.
- Prefer short-lived tokens where possible.
- Assume anything placed in a URL can leak (logs, referers, browser history). Avoid token-in-query-string patterns.

Related docs:

- [docs/SECRET_ROTATION.md](SECRET_ROTATION.md)
- [SECURITY_REMEDIATION_SUMMARY.md](../SECURITY_REMEDIATION_SUMMARY.md)

## Logging & redaction

- Don’t log access tokens, cookies, or authorization headers.
- Be careful when logging request objects — headers often contain secrets.
- If you add new logs around uploads, avoid printing filenames/paths if they reveal user structure.

## Auth changes (rules of thumb)

- Protected API routes should remain Bearer-only.
- Treat cookie-based auth as deprecated unless you’re intentionally working on a removal/transition plan.
- When adding a new route:
  - Default to `authenticateToken` for protected data.
  - Add explicit ownership checks.
  - Return 401/403 intentionally (avoid leaking whether an object exists).

## Image serving changes

Because `<img>` cannot send `Authorization` headers:

- Prefer signed URLs for thumbnails.
- If you add new image endpoints, be explicit about which access method they support.
- Avoid adding new “token in URL” mechanisms.

## Review checklist (PR time)

- Does any new endpoint expose user data without auth?
- Can a user access another user’s photos by guessing an id/hash?
- Did we introduce new debug routes, or widen an allowlist?
- Did we add any logs that could leak EXIF/GPS, tokens, or internal IDs?
- Are E2E-only routes still properly gated in non-production?

## When in doubt

If the safe behavior is ambiguous, bias toward:

- returning `401`/`403` over a partial response,
- removing data from responses (minimum necessary fields), and
- documenting the decision in an adjacent doc or in the PR description.
