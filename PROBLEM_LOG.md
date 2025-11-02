# Engineering Problem Log

A chronological log of major bugs or problems found in this photo app. Each entry notes:
- Date
- Issue summary
- How it was discovered
- Root cause
- Steps taken to debug it
- Resolution (code and/or process fix)
- Advice for expediting future discovery/fixes

---

## 2025-11-01: AI Caption/Metadata Not Appearing Until Hard Refresh

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

