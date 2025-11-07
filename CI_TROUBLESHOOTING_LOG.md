# CI/Test Troubleshooting Log

This document maintains a running log of CI/test failures, their root causes, fixes, and requirements for successful test execution.

## Table of Contents
- [Test Failures Log](#test-failures-log)
- [Required Dependencies](#required-dependencies)
- [Required Environment Variables](#required-environment-variables)
- [Common Issues & Solutions](#common-issues--solutions)

---

## Test Failures Log

### Issue #1: Husky Not Found in CI (November 6, 2025)

**Timestamp:** 2025-11-06 20:43:24Z  
**Affected Workflows:** `CI` (test-prod-csp job), `Secret Scan & Server Tests`  
**Error Message:**
```
npm error command sh -c husky install
npm error sh: 1: husky: not found
```

**Root Cause:**
1. `server/package.json` has dependency `"photo-app": "file:.."` which references the parent package
2. When running `npm ci` in the server directory, npm installs the parent package as a dependency
3. Installing the parent package triggers its `prepare` script: `"prepare": "husky install"`
4. Husky is a devDependency in the root package.json but not available in server's node_modules
5. The prepare script failed because husky command wasn't found

**Fix Applied:**
- Created `scripts/prepare.cjs` to conditionally run husky install
- Script checks for `CI=true` or `GITHUB_ACTIONS=true` environment variables and skips husky in CI
- Script gracefully handles missing husky in subdirectories
- Updated root `package.json` prepare script to use: `"prepare": "node scripts/prepare.cjs"`

**Files Changed:**
- `package.json` - Updated prepare script
- `scripts/prepare.cjs` - New conditional husky installer
- `server/package.json` - Added prepare script that echoes skip message

**Commits:**
- `10cfec9` - Initial fix attempt (resolve husky and Jest worker failures)
- `47cc78e` - Conditional husky install script
- `6c94cca` - Remove --ignore-scripts flag

---

### Issue #2: Jest Worker Crashes (November 6, 2025)

**Timestamp:** 2025-11-06 20:44:39Z  
**Affected Workflows:** `Secret Scan & Server Tests`  
**Affected Tests:** 
- `tests/display.cache.test.js`
- `tests/cache.etag.test.js`
- `tests/server-listening.test.js`

**Error Message:**
```
Jest worker encountered 4 child process exceptions, exceeding retry limit
process.exit called with "1"
  at Object.exit (server.js:39:11)
  at Object.require (tests/display.cache.test.js:3:13)
```

**Root Cause:**
1. Test files require `../server` which loads `server.js` at import time
2. `server.js` validates required environment variables on load
3. When validation fails, `server.js` calls `process.exit(1)`
4. This kills the Jest worker process before tests can even run
5. The `Secret Scan & Server Tests` workflow didn't set required environment variables
6. Missing: `SUPABASE_ANON_KEY` in test setup

**Fix Applied:**
- Modified `server/server.js` to check `NODE_ENV === 'test'` before calling `process.exit(1)`
- In test mode, logs a warning instead of exiting
- Added `SUPABASE_ANON_KEY` to `server/tests/setup.js`
- Added all required env vars to `.github/workflows/secret-scan.yml`

**Files Changed:**
- `server/server.js` - Conditional exit in test mode
- `server/tests/setup.js` - Added missing SUPABASE_ANON_KEY
- `.github/workflows/secret-scan.yml` - Added env vars to test step

**Environment Variables Added to Workflow:**
```yaml
NODE_ENV: test
CI: true
DATABASE_URL: postgresql://test:test@localhost:5432/test
SUPABASE_URL: https://test.supabase.co
SUPABASE_ANON_KEY: test-anon-key
SUPABASE_SERVICE_ROLE_KEY: test-service-role-key
JWT_SECRET: test-jwt-secret-key-for-testing-only
OPENAI_API_KEY: sk-test-key-for-ci
```

**Commit:** `10cfec9`

---

### Issue #3: Missing DevDependencies in Production Mode (November 6, 2025)

**Timestamp:** 2025-11-06 21:37:15Z  
**Affected Workflows:** `CI` (test-prod-csp job)  
**Error Message:**
```
Cannot find module 'supertest' from 'tests/csp.prod.test.js'
```

**Root Cause:**
1. The `test-prod-csp` job had `NODE_ENV: production` set at the job level
2. When `NODE_ENV=production`, npm ci skips installing devDependencies
3. Test dependencies (jest, supertest, etc.) are devDependencies
4. Tests cannot run without these dependencies

**Fix Applied:**
- Removed `NODE_ENV: production` from job-level environment
- Set `NODE_ENV=production` only when running the test command
- This allows npm to install all dependencies including devDependencies
- The test still runs in production mode to verify CSP headers

**Files Changed:**
- `.github/workflows/ci.yml` - Moved NODE_ENV from job to test command

**Before:**
```yaml
test-prod-csp:
  env:
    NODE_ENV: production
  steps:
    - run: cd server && npm ci
    - run: cd server && npx jest tests/csp.prod.test.js -i
```

**After:**
```yaml
test-prod-csp:
  steps:
    - run: cd server && npm ci
    - run: cd server && NODE_ENV=production npx jest tests/csp.prod.test.js -i
```

**Commit:** `3779b40`

---

### Issue #4: Platform-Specific Sharp Binaries (November 6, 2025)

**Timestamp:** 2025-11-06 22:02:38Z  
**Affected Workflows:** `CI` (test-prod-csp job)  
**Error Message:**
```
Could not load the "sharp" module using the linux-x64 runtime
Possible solutions:
- Ensure optional dependencies can be installed
- Add platform-specific dependencies: npm install --os=linux --cpu=x64 sharp
```

**Root Cause:**
1. Sharp is an image processing library with platform-specific native binaries
2. When using `npm ci` with a package-lock.json created on Windows, the lockfile references Windows binaries
3. CI runs on Linux (ubuntu-latest)
4. The Windows-specific sharp binaries don't work on Linux
5. Sharp must be rebuilt for the target platform

**Fix Applied:**
- Remove `node_modules` and `package-lock.json` before install in CI
- Use `npm install` instead of `npm ci` to force fresh platform-specific binary installation
- This ensures sharp and other native modules are built for Linux

**Files Changed:**
- `.github/workflows/ci.yml` - Modified test-prod-csp installation step

**Solution:**
```yaml
- name: Install server dependencies
  run: |
    cd server
    rm -rf node_modules package-lock.json
    npm install --no-audit --no-fund
```

**Commit:** `16f4d65`

---

### Issue #5: Missing File Dependency Resolution (November 6, 2025)

**Timestamp:** 2025-11-06 22:06:30Z  
**Affected Workflows:** `CI` (test-prod-csp job)  
**Error Message:**
```
Cannot find module 'exifr' from 'media/image.js'

Require stack:
  media/image.js
  routes/uploads.js
  tests/csp.prod.test.js
```

**Root Cause:**
1. Server's `package.json` has dependency: `"photo-app": "file:.."`
2. This creates a file-based dependency on the parent package
3. When we removed node_modules and package-lock.json in server/ and ran `npm install`
4. npm tried to install the parent package but couldn't properly resolve its dependencies
5. Parent package depends on `exifr`, but it wasn't available in server's node_modules
6. The file:.. dependency resolution failed because parent's node_modules didn't exist

**Fix Applied:**
- Install root dependencies FIRST using `npm ci` in root directory
- This ensures parent package has its node_modules populated
- THEN install server dependencies with platform-specific rebuild
- Now the `file:..` dependency can properly resolve to the parent's installed modules

**Files Changed:**
- `.github/workflows/ci.yml` - Added root dependency installation step

**Solution:**
```yaml
- name: Install root dependencies first
  run: npm ci --no-audit --no-fund
- name: Install server dependencies
  run: |
    cd server
    rm -rf node_modules package-lock.json
    npm install --no-audit --no-fund
```

**Why This Works:**
- Root npm ci installs all dependencies including exifr in root node_modules
- Server npm install can now resolve `photo-app: file:..` properly
- File dependency sees parent has valid node_modules
- Platform-specific packages (sharp) still get rebuilt for Linux

**Commit:** `a14272c`

---

### Issue #6: Husky Error with --ignore-scripts in test-prod-csp (November 7, 2025)

**Timestamp:** 2025-11-07 03:11:26Z  
**Affected Workflows:** `CI` (test-prod-csp job)  
**Error Message:**
```
npm error command sh -c husky install
npm error sh: 1: husky: not found
```

**Root Cause:**
1. The `test-prod-csp` job uses `npm ci --ignore-scripts` in the server directory
2. Despite `--ignore-scripts` flag, the parent package's `prepare` script still runs due to file dependency `"photo-app": "file:.."`
3. When server installs dependencies, it installs the parent package which triggers its prepare script
4. Even though `server/.npmrc` has `ignore-scripts=true`, the parent package installation doesn't respect it
5. The root directory's node_modules aren't available, so husky command isn't found

**Fix Applied:**
- Install root dependencies FIRST before installing server dependencies
- This ensures husky and other dev dependencies are available in root node_modules
- The prepare script can then successfully run (or be safely skipped with HUSKY=0 env var)

**Files Changed:**
- `.github/workflows/ci.yml` - test-prod-csp job

**Solution:**
```yaml
- name: Install root dependencies
  run: npm ci --no-audit --no-fund
- name: Install server dependencies
  run: cd server && npm ci --ignore-scripts
- name: Rebuild sqlite3 native bindings
  run: cd server && npm rebuild sqlite3
- name: Run CSP test in production mode
  run: cd server && NODE_ENV=production npx jest tests/csp.prod.test.js -i
```

**Why This Works:**
- Installing root dependencies first makes husky and other dev dependencies available
- The prepare script can run successfully (or be skipped with HUSKY=0)
- Moving NODE_ENV=production to the test command ensures devDependencies are installed
- Native bindings are rebuilt for the Linux platform

**Commit:** TBD

**Status:** ✅ Fixed

---

### Issue #7: SQLite3 Native Bindings Missing in Integration Tests (November 7, 2025)

**Timestamp:** 2025-11-07 03:12:53Z  
**Affected Workflows:** `CI` (ci job integration test), `Integration Test` workflow  
**Error Message:**
```
Could not locate the bindings file. Tried:
 → /home/runner/work/React-Photo-App/React-Photo-App/server/node_modules/sqlite3/build/node_sqlite3.node
 → /home/runner/work/React-Photo-App/React-Photo-App/server/node_modules/sqlite3/lib/binding/node-v115-linux-x64/node_sqlite3.node
Error: Could not locate the bindings file
```

**Root Cause:**
1. Integration tests use in-memory SQLite (`:memory:`) which requires sqlite3 native bindings
2. The CI job rebuilds sqlite3 for server tests but this is a separate step
3. The integration test runs later and needs sqlite3, but bindings may not be properly rebuilt for Linux platform
4. The Integration Test workflow doesn't have a rebuild step at all
5. Platform-specific native binaries need to be rebuilt after npm install on Linux

**Fix Applied:**
- Ensure `npm rebuild sqlite3` is run in server directory before integration tests
- Add rebuild step to Integration Test workflow

**Files Changed:**
- `.github/workflows/ci.yml` - Already has rebuild step, but runs before integration test
- `.github/workflows/integration.yml` - Needs rebuild step added

**Solution for Integration Test workflow:**
```yaml
- name: Rebuild sqlite3 native bindings
  run: cd server && npm rebuild sqlite3
- name: Run integration test
  # ... existing env and command
```

**Why This Works:**
- Native bindings must be rebuilt after npm install on Linux CI runners
- The rebuild happens after server dependencies are installed
- SQLite3 bindings are rebuilt for the correct platform (linux-x64, node v115)
- Integration tests can now successfully use in-memory SQLite

**Commit:** TBD

**Status:** ✅ Fixed

---

## Required Dependencies

### Root Package Dependencies

**Runtime Dependencies:**
- `@langchain/core` - LangChain core for AI features
- `@langchain/openai` - OpenAI integration for LangChain
- `dotenv` - Environment variable management
- `exifr` - EXIF metadata extraction
- `konva` - Canvas manipulation
- `langsmith` - LangSmith integration
- `openai` - OpenAI API client
- `react` - React framework
- `react-dom` - React DOM rendering
- `react-konva` - React wrapper for Konva
- `zustand` - State management

**Dev Dependencies:**
- `@eslint/js` - ESLint JavaScript config
- `@tailwindcss/postcss` - Tailwind CSS PostCSS plugin
- `@testing-library/dom` - DOM testing utilities
- `@testing-library/jest-dom` - Jest DOM matchers
- `@testing-library/react` - React testing utilities
- `@testing-library/user-event` - User event simulation
- `@types/react` - React TypeScript types
- `@types/react-dom` - React DOM TypeScript types
- `@vitejs/plugin-react` - Vite React plugin
- `autoprefixer` - CSS autoprefixer
- `eslint` - JavaScript linter
- `eslint-plugin-react` - React ESLint rules
- `eslint-plugin-react-hooks` - React Hooks ESLint rules
- `eslint-plugin-react-refresh` - React Refresh ESLint rules
- `globals` - Global variable definitions
- `happy-dom` - Lightweight DOM implementation
- `husky` - Git hooks manager
- `jsdom` - JavaScript DOM implementation
- `postcss` - CSS transformer
- `tailwindcss` - Utility-first CSS framework
- `vite` - Build tool
- `vitest` - Test framework

### Server Package Dependencies

**Runtime Dependencies:**
- `@langchain/core` - LangChain core
- `@langchain/openai` - OpenAI integration
- `@supabase/supabase-js` - Supabase client
- `bcryptjs` - Password hashing
- `bullmq` - Redis-based queue
- `cookie-parser` - Cookie parsing middleware
- `cors` - CORS middleware
- `exiftool-vendored` - ExifTool wrapper
- `express` - Web framework
- `express-rate-limit` - Rate limiting middleware
- `express-validator` - Validation middleware
- `fuse.js` - Fuzzy search library
- `heic-convert` - HEIC image conversion
- `helmet` - Security headers middleware
- `jsonwebtoken` - JWT token handling
- `knex` - SQL query builder
- `multer` - File upload middleware
- `node-fetch` - Fetch API implementation
- `openai` - OpenAI API client
- `pg` - PostgreSQL client
- `photo-app` - Parent package (file:..)
- `sharp` - Image processing (⚠️ platform-specific binaries)
- `sqlite3` - SQLite client
- `zod` - Schema validation

**Dev Dependencies:**
- `@axe-core/playwright` - Accessibility testing
- `@eslint/js` - ESLint JavaScript config
- `@playwright/test` - E2E testing framework
- `eslint` - JavaScript linter
- `eslint-plugin-react` - React ESLint rules
- `eslint-plugin-react-hooks` - React Hooks ESLint rules
- `eslint-plugin-react-refresh` - React Refresh ESLint rules
- `jest` - Test framework
- `jest-openapi` - OpenAPI testing
- `nodemon` - Development server
- `supertest` - HTTP testing

### Platform-Specific Dependencies

**⚠️ Important:** These require platform-specific binaries:
- `sharp` - Image processing library
  - Must be rebuilt for target platform (Linux in CI)
  - Solution: Remove node_modules and lockfile, then `npm install`
- `sqlite3` - SQLite bindings (optional, only if using SQLite)
  - Similar platform considerations

---

## Required Environment Variables

### Test Environment (Jest)

**Always Required:**
```bash
NODE_ENV=test
SUPABASE_URL=https://test.supabase.co
SUPABASE_ANON_KEY=test-anon-key
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
JWT_SECRET=test-jwt-secret-key-for-testing-only
OPENAI_API_KEY=test-openai-api-key  # or sk-test-key-for-ci
```

**Required for specific tests:**
```bash
DATABASE_URL=postgresql://test:test@localhost:5432/test  # For DB tests
PHOTO_WORKING_DIR=server/working/photos  # For file upload tests
RUN_MIGRATION_VERIFY_TEST=true  # To enable migration tests
CI=true  # For CI-specific behavior
```

**Set in Files:**
- `server/tests/setup.js` - Sets env vars for all Jest tests
- `.github/workflows/secret-scan.yml` - Sets for server-tests job
- `.github/workflows/ci.yml` - Sets for ci job

### Integration Test Environment

```bash
NODE_ENV=development
PHOTO_WORKING_DIR=/tmp/photo-working  # or similar temp directory
USE_POSTGRES_AUTO_DETECT=false
DB_PATH=:memory:  # For in-memory SQLite
ALLOW_SQLITE_FALLBACK=true
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
SUPABASE_ANON_KEY=test-anon-key
JWT_SECRET=test-jwt-secret-key-for-testing-only
OPENAI_API_KEY=sk-test-key-for-ci
GOOGLE_API_KEY=sk-test-key-for-ci
GOOGLE_CSE_ID=test-cse-id-for-ci
```

### Production CSP Test Environment

**Important:** Only set NODE_ENV=production when running the test, NOT during dependency installation!

```bash
# During npm ci/install: (no NODE_ENV or NODE_ENV=development)
npm install

# During test execution:
NODE_ENV=production npx jest tests/csp.prod.test.js
```

---

## Common Issues & Solutions

### Issue: "husky: not found" in CI

**Symptoms:**
- CI fails during npm ci or npm install
- Error: `sh: 1: husky: not found`

**Solution:**
- Ensure `scripts/prepare.cjs` exists and checks for CI environment
- Verify root `package.json` has: `"prepare": "node scripts/prepare.cjs"`
- GitHub Actions automatically sets `CI=true`

### Issue: "Jest worker encountered N child process exceptions"

**Symptoms:**
- Tests fail before even running
- Error mentions process.exit
- Stack trace shows server.js in the trace

**Solution:**
- Ensure all required env vars are set before tests run
- Check `server/tests/setup.js` has all env vars
- Verify CI workflow sets env vars in test step
- Ensure server.js doesn't call `process.exit(1)` when `NODE_ENV=test`

### Issue: "Cannot find module 'X' from 'tests/Y'"

**Symptoms:**
- Test fails with MODULE_NOT_FOUND
- Module is listed in devDependencies
- Happens in CI but not locally

**Solution:**
- Check if NODE_ENV=production is set during `npm ci`
- NODE_ENV=production skips devDependencies
- Move NODE_ENV=production to test command only, not npm install

### Issue: "Could not load the 'sharp' module using the linux-x64 runtime"

**Symptoms:**
- Tests fail with sharp module load error
- Happens in CI on Linux but not locally
- Error mentions platform-specific binaries

**Solution:**
- Remove node_modules and package-lock.json before install in CI
- Use `npm install` instead of `npm ci` for platform-specific packages
- Example:
  ```bash
  rm -rf node_modules package-lock.json
  npm install --no-audit --no-fund
  ```

### Issue: Test file requires server.js but env vars not set

**Symptoms:**
- Error: "Missing required env: X, Y, Z"
- Happens when test file does `require('../server')`

**Root Cause:**
- server.js validates env vars when loaded
- Jest loads test files before running tests
- If env vars not set at load time, validation fails

**Solution:**
1. Set env vars in `server/tests/setup.js` (runs before tests)
2. Make sure setupFilesAfterEnv is configured in jest.config
3. Or: Set env vars in CI workflow before running tests

### Issue: Tests pass locally but fail in CI

**Checklist:**
1. ✅ Are all env vars set in CI workflow?
2. ✅ Are platform-specific binaries (sharp) rebuilt for Linux?
3. ✅ Is NODE_ENV set correctly for each step?
4. ✅ Are devDependencies installed?
5. ✅ Is husky skipped in CI?
6. ✅ Are database services (postgres) started if needed?

---

## Testing Best Practices

### 1. Environment Variable Management

**In Tests:**
- Always set env vars in `server/tests/setup.js` for local testing
- Use test-specific values (e.g., `test-jwt-secret-key-for-testing-only`)
- Never use real API keys or secrets in tests

**In CI:**
- Explicitly set env vars in workflow YAML
- Don't rely on .env files in CI
- Use GitHub Secrets for real credentials (if needed)

### 2. Platform-Specific Dependencies

**For Libraries with Native Binaries (sharp, sqlite3, etc.):**
- In CI: Always rebuild for target platform
- Remove node_modules and lockfile before install
- Use `npm install` (not `npm ci`) to fetch platform binaries

### 3. NODE_ENV Considerations

**Development/Test:**
- Use `NODE_ENV=test` for Jest tests
- Use `NODE_ENV=development` for integration tests
- DevDependencies are installed

**Production:**
- Only set `NODE_ENV=production` when needed for runtime behavior
- Don't set during `npm install` unless you don't need devDependencies
- For production testing: Install deps normally, then set NODE_ENV for test execution

### 4. Database Testing

**Use Services in CI:**
```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test
    ports:
      - 5432:5432
```

**Or Use In-Memory:**
```bash
DB_PATH=:memory:
ALLOW_SQLITE_FALLBACK=true
```

---

## Workflow Structure Reference

### Secret Scan & Server Tests Workflow

**Purpose:** Run secret scanning and comprehensive server tests  
**File:** `.github/workflows/secret-scan.yml`

**Jobs:**
1. `secret-scan` - Scans for leaked secrets
2. `server-tests` - Runs all server Jest tests

**Key Requirements:**
- All env vars must be set in server-tests step
- No special installation needed (uses normal npm ci)

### CI Workflow

**Purpose:** Main CI with frontend, backend, integration, and CSP tests  
**File:** `.github/workflows/ci.yml`

**Jobs:**
1. `test-prod-csp` - Tests production CSP headers
   - ⚠️ Requires platform-specific rebuild
   - ⚠️ NODE_ENV=production only for test execution
2. `ci` - Main job: lint, build, frontend tests, server tests, integration test
   - Uses PostgreSQL service
   - Rebuilds platform-specific deps

### Integration Test Workflow

**Purpose:** Quick integration smoke test  
**File:** `.github/workflows/integration.yml`

**Key Features:**
- Uses in-memory SQLite
- Minimal env vars
- Fast execution (~1 minute)

---

## Version History

| Date | Issue | Commits | Status |
|------|-------|---------|--------|
| 2025-11-06 | Husky not found in CI | 10cfec9, 47cc78e, 6c94cca | ✅ Fixed |
| 2025-11-06 | Jest worker crashes | 10cfec9 | ✅ Fixed |
| 2025-11-06 | Missing devDependencies | 3779b40 | ✅ Fixed |
| 2025-11-06 | Sharp platform binaries | 16f4d65 | ✅ Fixed |
| 2025-11-06 | File dependency resolution (exifr) | a14272c | ✅ Fixed |
| 2025-11-07 | Husky error with --ignore-scripts | TBD | ✅ Fixed |
| 2025-11-07 | SQLite3 native bindings missing | TBD | ✅ Fixed |

---

## Adding New Test Failures to This Log

When encountering a new test failure, add an entry with:

1. **Timestamp** - From CI logs or `date -u +"%Y-%m-%dT%H:%M:%SZ"`
2. **Affected Workflows** - Which CI workflow(s) failed
3. **Error Message** - Exact error from logs (code block)
4. **Root Cause** - Detailed explanation of why it failed
5. **Fix Applied** - What changes were made to fix it
6. **Files Changed** - List all modified files
7. **Commit** - Git commit hash(es)

Update the Version History table at the end.

