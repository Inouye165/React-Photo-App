# Production Environment Variable Fix

## Issue
Production deployment at https://www.justmypeeps.org is experiencing 403 authentication errors due to missing CORS configuration.

## Root Cause
The production backend environment variable `CORS_ORIGIN` only includes local development origins:
```
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

This does not include the production frontend origin, causing CORS validation to reject requests from https://www.justmypeeps.org.

## Required Fix

### Railway Backend Environment Variables

Update the `CORS_ORIGIN` environment variable in Railway to include the production frontend origin:

```bash
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,https://justmypeeps.org,https://www.justmypeeps.org
```

**OR** (recommended) use the newer configuration variables:

```bash
ALLOWED_ORIGINS=https://justmypeeps.org,https://www.justmypeeps.org
```

The `addSingleOriginWithWwwVariants()` function in [server/config/allowedOrigins.js](server/config/allowedOrigins.js) will automatically add both `justmypeeps.org` and `www.justmypeeps.org` variants if you use the simplified form:

```bash
FRONTEND_ORIGIN=https://justmypeeps.org
```

### Verification

After updating the environment variable:
1. Restart the Railway service
2. Check the startup logs for: `[CORS] Allowed origins: ...` (should include https://www.justmypeeps.org)
3. Test authentication flows from production frontend
4. Verify no more 403 errors on `/api/users/me/preferences` or `/photos/dependencies`

## Code Changes Made

Fixed authentication API calls that were missing CSRF protection and credentials:

### 1. AuthContext.tsx
- **fetchPreferences()**: Changed from plain `fetch()` to `request()` wrapper (adds `credentials: 'include'`)
- **patchPreferences()**: Changed from plain `fetch()` to `request()` wrapper (adds CSRF token + credentials)
- **loadDefaultPreferences()**: Changed from plain `fetch()` to `request()` wrapper (adds CSRF token + credentials)

### 2. AuthWrapper.tsx
- **checkTermsAcceptance()**: Changed from plain `fetch()` to `request()` wrapper (adds `credentials: 'include'`)

### Why These Changes Matter

The `request()` wrapper in [src/api/httpClient.ts](src/api/httpClient.ts) automatically:
- Adds `credentials: 'include'` for all requests (required for cookie-based auth)
- Forces `credentials: 'include'` for unsafe methods (POST/PUT/PATCH/DELETE)
- Fetches and attaches CSRF tokens for unsafe methods
- Handles auth errors consistently
- Retries with network fallback logic

Using plain `fetch()` bypasses all of this infrastructure and causes:
- Missing cookies in cross-origin requests
- Missing CSRF tokens in POST/PATCH/DELETE requests
- 403 Forbidden errors from backend validation

## CORS Configuration Details

The backend CORS configuration in [server/config/allowedOrigins.js](server/config/allowedOrigins.js):
- Uses explicit origin allowlisting (no wildcards)
- Supports `credentials: true` for cookie/Bearer token authentication
- Auto-adds www variants for apex domains
- Respects `ALLOWED_ORIGINS`, `FRONTEND_ORIGIN`, and legacy `CORS_ORIGIN` env vars
- Rejects requests from unlisted origins with no CORS headers

## Related Files
- [server/config/allowedOrigins.js](server/config/allowedOrigins.js) - CORS configuration
- [server/bootstrap/registerMiddleware.js](server/bootstrap/registerMiddleware.js) - Middleware registration
- [src/api/httpClient.ts](src/api/httpClient.ts) - Request wrapper with CSRF handling
- [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx) - User preferences API calls
- [src/layouts/AuthWrapper.tsx](src/layouts/AuthWrapper.tsx) - Terms acceptance check
