# Whiteboard implementation issue list (2026-03-03)

## Scope checked
- Backend whiteboard routes/realtime:
  - `server/routes/whiteboard.ts`
  - `server/realtime/whiteboard.ts`
  - `server/realtime/whiteboardWsTokens.ts`
- Frontend whiteboard modules/components:
  - `src/components/whiteboard/WhiteboardCanvas.tsx`
  - `src/components/whiteboard/WhiteboardPad.tsx`
  - `src/components/whiteboard/WhiteboardViewer.tsx`
  - `src/realtime/whiteboardYjsProvider.ts`
  - `src/realtime/whiteboardTransport.ts`
  - `src/realtime/whiteboardStrokeQueue.ts`
  - `src/realtime/whiteboardReplay.ts`
  - `src/api/whiteboards.ts`

## Main error status (fixed)
- **Issue:** `POST /api/whiteboards/:boardId/invites` could return 500 with FK violation `whiteboard_invites_room_id_foreign`.
- **Fix applied:** Added room existence guard + FK-aware fallback handling in `server/routes/whiteboard.ts`.
- **Behavior now:** returns `404` with `reason: room_not_found` instead of internal server error.
- **Regression test added:** `invite creation returns 404 when room row is missing` in `server/tests/whiteboard.invites.route.test.ts`.

## Additional issues found (not fixed yet)
1. **Cross-source membership fallback can mask DB drift** (Medium)
   - `isBoardOwner` / `isMember` can fall back to Supabase API when Knex lookup fails.
   - If membership is visible via fallback but corresponding `rooms` row is missing on write path, behavior becomes inconsistent.
   - Current invite-route fix prevents 500, but the architecture still allows split-brain read/write signals.

2. **Very noisy whiteboard/proxy debug logs in browser console** (Low)
   - Repeated `[HTTP][PROXY-DEBUG] Request completed` entries can hide actionable errors during debugging.
   - Not a functional bug, but impacts troubleshooting signal-to-noise.

3. **`A listener indicated an asynchronous response...` browser console errors** (Low, likely external)
   - Seen at `:5173/:1` and typically caused by browser extensions/background listeners, not app business logic.
   - Keep noted as environment noise unless reproducible in clean/incognito profile.

## Verification results
- **Migration state:** `server` migration status now reports **no pending migrations** (includes `20260302000001_create_whiteboard_invites.js`).
- **Backend whiteboard tests:** passed
  - `whiteboard.invites.route.test.ts`
  - `whiteboard.history.route.test.ts`
  - `whiteboard.ws-token.route.test.ts`
  - `whiteboard.snapshot.route.test.ts`
  - `whiteboard.realtime.idempotency.test.ts`
  - `whiteboard.realtime.no-history.test.ts`
- **Frontend whiteboard tests:** passed
  - `src/realtime/whiteboardStrokeQueue.test.ts`
  - `src/realtime/whiteboardReplay.test.ts`
  - `src/components/whiteboard/whiteboardAspect.test.ts`
- **IDE diagnostics (`get_errors`) on key whiteboard files:** no errors found.
