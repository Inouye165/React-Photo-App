## 🚀 Description
Fixes intermittent backend rate-limit flake/crash: `ERR_ERL_DOUBLE_COUNT` from overlapping `express-rate-limit` middleware.

## 🛠️ Changes
### 🧯 Prevent overlapping limiters from double-counting
- Update global limiter configuration in `server/middleware/security.js` so a request is never processed by multiple limiters (global + per-prefix + per-router).
- Uses `skip()` to ensure only the most specific limiter runs for:
  - `/api/*` and `/photos/*` (handled by `apiLimiter`)
  - `/upload/*` (handled by `uploadLimiter`)
  - `/api/auth/*`, `/api/public/*`, `/api/test/*` (these routers have their own dedicated limiters)

### 🧪 Regression coverage
- Add a Jest regression test to ensure mounting `configureSecurity(app)` plus router-specific limiters does not throw `ERR_ERL_DOUBLE_COUNT`:
  - `server/tests/ratelimit.doubleCount.test.js`

## ✅ Verification
- Server tests: `cd server && npm test`
- Server lint: `cd server && npm run lint`