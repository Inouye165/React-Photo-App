> Historical note: This is a point-in-time log. Paths, scripts, or auth models may not match the current main branch.

# Engineering Problem Log

A chronological log of major bugs or problems found in this photo app. Each entry notes:
- Date
- Issue summary
- How it was discovered
- Root cause
- Steps taken to debug it
- Resolution (code and/or process fix)
- Advice for expediting future discovery/fixes


## 2025-11-23 - Tailwind CSS Not Working (Missing Styles)

**Issue:**
- Login page appeared completely unstyled (like 1990s HTML) with no CSS applied despite having Tailwind utility classes in the JSX.
- All Tailwind classes (`bg-gray-50`, `rounded-lg`, `shadow-lg`, `px-3`, `py-2`, etc.) were being ignored.
- Other components in the app appeared to work fine.

**How Discovered:**
- User reported that the redesigned login page looked completely unstyled after a UX overhaul.
- Initial troubleshooting revealed dev servers had crashed, but restarting them didn't fix the styling issue.

**Root Cause:**
- **Tailwind CSS v4 syntax incompatibility**: The project was using Tailwind CSS v4.1.14 with `@tailwindcss/postcss`, but `src/index.css` still used the old Tailwind v3 import syntax:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```
- Tailwind v4 requires the new `@import` syntax:
  ```css
  @import "tailwindcss";
  ```
- With the wrong syntax, Tailwind v4 was compiling but only generating a minimal subset of utilities that were used elsewhere in the codebase, ignoring any new classes added to components.

**Debugging Steps:**
1. Checked if dev servers were running - they had crashed (Exit Code: 1).
2. Restarted frontend dev server successfully.
3. Verified Tailwind directives were present in `src/index.css`.
4. Confirmed CSS file was being imported in `src/main.jsx`.
5. Inspected compiled CSS output from Vite - noticed Tailwind was generating CSS but missing the specific utility classes used in LoginForm.
6. Discovered project was using Tailwind v4.1.14 with `@tailwindcss/postcss` in `postcss.config.js`.
7. Identified syntax mismatch - v3 syntax (`@tailwind`) vs v4 requirement (`@import`).

**Resolution:**
- Changed `src/index.css` from:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```
  To:
  ```css
  @import "tailwindcss";
  ```
- This immediately triggered Vite hot reload, and all Tailwind utility classes started working correctly.

**Expedite Future Discovery:**
- When upgrading major versions of CSS frameworks, always check for breaking changes in import syntax.
- Add a pre-commit check or linting rule to validate Tailwind configuration matches the installed version.
- Document the Tailwind version and required syntax in project README.
- When debugging "missing styles," verify the CSS framework is using the correct syntax for its version, not just that it's installed.

**Lessons Learned:**
- Tailwind v4 is a complete rewrite with breaking changes to the import syntax.
- The old `@tailwind` directives are silently ignored in v4, leading to partial CSS generation.
- Always check dependency versions when troubleshooting styling issues after upgrades.

---

## TO DO

* [x] **Code Review Fixes (High Priority):** Address critical security, resilience, and operational issues identified during a recent code review. See [PROFESSIONAL_CODE_REVIEW_LOG.md] for strategy, sub-tasks, and implementation details.

## 2025-11-19 - Security & Stability Audit Fixes

**Issue:**
- A comprehensive code review identified four critical issues:
    1.  **Security**: `/api/collectibles` route was exposed without authentication.
    2.  **Configuration**: `README.md` incorrectly suggested SQLite fallback (which was removed), causing confusion.
    3.  **Race Condition**: File uploads used a "check-then-act" pattern (list then upload), prone to race conditions.
    4.  **Resource Risk**: AI service downloaded full files into memory before processing, risking OOM on large files.

**How Discovered:**
- Manual code review and security audit.

**Root Cause:**
- **Security**: Missing middleware on a specific route mount.
- **Configuration**: Documentation drift after removing SQLite support.
- **Race Condition**: Naive implementation of duplicate checking.
- **Resource Risk**: Using `buffer()` on potentially large downloads instead of streaming.

**Resolution:**
- **Security**: Applied `authenticateToken` middleware to `/api/collectibles` in `server/server.js`.
- **Configuration**: Updated `README.md` to explicitly state Postgres requirement and remove SQLite instructions.
- **Race Condition**: Refactored `server/routes/uploads.js` to use an atomic "upload with `upsert: false`" loop, relying on storage provider error codes for duplicate detection.
- **Resource Risk**: Refactored `server/ai/service.js` to stream downloads from Supabase and pipe them through `sharp` to resize (max 2048px) and convert to JPEG on-the-fly, significantly reducing memory footprint.

**Expedite Future Discovery:**
- Use automated security scanning tools to detect unauthenticated routes.
- Keep documentation in sync with code changes (e.g., via pre-commit checks or strict PR requirements).
- Prefer atomic operations over "check-then-act" for file system/storage operations.
- Always prefer streaming for file processing, especially in Node.js environments with limited memory.

**Issue:**
- Users reported `429 Too Many Requests` errors in the browser console, even when interacting with a single photo.
- The frontend polling (for AI updates and dependency status) was aggressive enough to trigger the strict default API rate limits (50 requests/15min).

**How Discovered:**
- User report with browser console logs showing 429 errors on `/photos?state=working` and `/photos/dependencies`.

**Root Cause:**
- The default API rate limit in `server/middleware/security.js` was set to 50 requests per 15 minutes, which is too low for an app with active polling (every 3s for AI, every 30s for dependencies).

**Resolution:**
- Increased API rate limit to 1000 requests per 15 minutes.
- Increased general rate limit to 2000 requests per 15 minutes.
- Increased upload rate limit to 100 requests per 15 minutes.

**Expedite Future Discovery:**
- Monitor rate limit hits in production logs.
- Configure rate limits based on expected traffic patterns, accounting for polling intervals.

(Add new entries below for each major or instructive bug/root cause encountered!)

**Issue:**
- After an AI process completed on a photo (Supabase DB updated, backend logs correct), the UI would not visually show new caption/description/keywords until a manual browser hard refresh. Polling logs in React and Zustand state appeared correct, but DOM fields did not update.

**How Discovered:**
- User observed updated metadata in backend and DB via logs, but no visible UI update without CTRL+Shift+R.
- Confirmed by multiple browsers/sessions.

**Root Cause:**
- Frontend polling (useAIPolling) would fetch the photo *before* the AI update landed in the DB, then stop polling, never seeing the new values. React and Zustand state remained unchanged until manual refresh.

**Debug Steps:**
- Examined backend logs (showed DB was correct)
- Used browser devtools network panel: saw GETs fired before AI update completed.
- Verified polling would stop too early (no new data detected, but polling abandoned)
- Inserted extensive console.debug logs in polling, store, and component render flows.
- Ruled out all wrappers, controlled fields, memoization, state sync, and modal key props.

**Resolution:**
- Refactored polling logic: it now continues to poll until the actual AI fields (caption/description/keywords) change from their original values at polling start, not just until *any* GET response arrives.
- Polling is now robust to backend/DB delays and guaranteed to bring fresh values into the DOM.

**Expedite Future Discovery:**
- Always cross-check frontend polling behavior with both backend timing/logs and browser GET/Response timing in the network tab.
- Write tests that simulate delays in backend writes and confirm the UI reacts only after receiving actual new values.
- Use aggressive state/DOM logging for any UI where backend-propagated values are expected.
- Document the polling test and improve test coverage for edge cases.

---

(Add new entries below for each major or instructive bug/root cause encountered!)

---

**Issue:**
- OpenAI vision workers intermittently failed with `Invalid content type. image_url is only supported by certain models` whenever operators overrode the AI model to a text-only variant.

**How Discovered:**
- Worker logs showed repeated 400 errors during HEIC processing while local overrides were in place; manual retries reproduced on demand.

**Root Cause:**
- The backend allowed user-selected models that lacked vision support, so LangChain requests included `image_url` parts that the chosen model schema rejected.

**Debug Steps:**
- Reviewed worker logs and stack traces for failed jobs.
- Grepped the AI service for `image_url` usage and traced how overrides were threaded through agents.
- Confirmed model allowlist still contained text-only defaults from earlier releases.

**Resolution:**
- Added `server/ai/modelCapabilities.js` with helpers to detect/ensure vision-capable models.
- Wrapped all default and override selections in `ensureVisionModel`, rebuilt the allowlist to vision-only options, and surfaced substitution telemetry in logs/results.
- Updated history records to capture effective models for future audits.

**Expedite Future Discovery:**
- Keep the model allowlist constrained to schema-compatible variants and document any exceptions.
- Alert on repeated schema mismatch errors in worker logs so regressions are caught quickly.
- When introducing new overrides, run end-to-end HEIC/vision fixtures before promoting the model to operators.

