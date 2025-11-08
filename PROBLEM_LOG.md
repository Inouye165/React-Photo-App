# Engineering Problem Log

A chronological log of major bugs or problems found in this photo app. Each entry notes:
- Date
- Issue summary
- How it was discovered
- Root cause
- Steps taken to debug it
- Resolution (code and/or process fix)
- Advice for expediting future discovery/fixes


## TO DO

* [ ] **Code Review Fixes (High Priority):** Address critical security, resilience, and operational issues identified during a recent code review. See [PROFESSIONAL_CODE_REVIEW_LOG.md] for strategy, sub-tasks, and implementation details.

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

