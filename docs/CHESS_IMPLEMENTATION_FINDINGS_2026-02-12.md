# Chess Implementation Findings (Brainstorm)

Date: 2026-02-12  
Scope reviewed:
- `src/pages/ChessGame.tsx`
- `src/hooks/useStockfish.ts`
- `src/hooks/useGameRealtime.ts`
- `src/api/games.ts`
- `src/pages/GamesIndex.tsx`
- `src/pages/ChessGame.test.tsx`
- `supabase/migrations/20260210120000_create_games_tables.sql`
- `supabase/migrations/20260210141000_harden_chess_moves_and_abort.sql`
- `supabase/migrations/20260210143000_restart_game.sql`
- `supabase/migrations/20260210150000_fix_chess_moves_turn_policy.sql`

---

## Status Update (implemented)

- [x] Hint UX: single **Show hints** button, visible-through-current-move behavior, hover/tap square highlighting, usage counter, and `*` move marking in history.
- [x] Performance #3: debounced user search in `GamesIndex` with stale response suppression test coverage.
- [x] UX #1: board orientation now follows player color (black players see black orientation in online games).
- [x] UX #3: move history SAN entries are clickable and jump to the selected ply.
- [x] Correctness fix: local-mode black replies now use FEN-derived ply numbering so black moves reliably appear in move history.

### Newly pulled from findings and implemented this pass

- [x] **UX #1 No board orientation by player color**
- [x] **UX #3 Move history not directly clickable for jump-to-ply**

---

## 1) Clearly wrong / correctness risks

1. **Server trusts client-provided `fen_after` without validating legality against prior position** (high)
   - Evidence: `supabase/migrations/20260210141000_harden_chess_moves_and_abort.sql` updates `games.current_fen` directly from `NEW.fen_after` (lines around 32-36) and sets turn from split FEN.
   - Impact: a malicious client can submit illegal board states / cheat while still passing turn-based RLS checks.
   - Improvement: validate move server-side from authoritative previous FEN + UCI (or store only UCI, compute next FEN on server).

2. **Threat highlighting logic is not chess-correct in edge cases** (high)
   - Evidence: `src/pages/ChessGame.tsx` (`buildAttackMap` around line 247, `isDefended` around line 276).
   - Why wrong: uses legal moves as attack map proxy and `remove(square)` based defense checks; pins/check constraints skew “attacked/defended” semantics.
   - Improvement: use pseudo-legal attack generation or a dedicated attacked-square function.

3. **Realtime model does not handle restart/opponent reset reliably** (high)
   - Evidence: `src/hooks/useGameRealtime.ts` listens only to `INSERT` on `chess_moves` (line ~41).
   - Impact: opponent-triggered restart (`DELETE chess_moves` + game row update) can leave stale move history until manual refresh.
   - Improvement: subscribe to `DELETE`/`UPDATE` events and/or subscribe to `games` row updates.

4. **`onPieceDrop` returns success before async move persistence completes** (medium-high UX/correctness)
   - Evidence: `src/pages/ChessGame.tsx` lines ~658-664 and ~1054-1060 call `void onDrop(...)` then immediately return `true`.
   - Impact: temporary optimistic board behavior can desync/jitter if server rejects move.
   - Improvement: make drop handling await persistence outcome before confirming drop (or explicit optimistic state + rollback).

5. **Promotion is hardcoded to queen only** (medium)
   - Evidence: `promotion: 'q'` at lines ~446, ~662, ~945, ~1058.
   - Impact: incorrect chess behavior for underpromotion scenarios.
   - Improvement: add promotion chooser UI and support `q/r/b/n`.

---

## 2) Robustness and state consistency gaps

1. **Game row and members creation is not transactional** (high)
   - Evidence: `src/api/games.ts` creates game then inserts members separately (`createChessGame` around lines 133, 143-144).
   - Impact: orphan game rows possible if second insert fails.
   - Improvement: move creation into RPC/stored procedure transaction.

2. **No server-side game result lifecycle update shown** (high)
   - Evidence: no DB function/trigger computing checkmate/stalemate/threefold/50-move end conditions; online UI mostly keys off move stream.
   - Impact: status/result can remain inaccurate/incomplete.
   - Improvement: define authoritative game state transition rules in DB/service layer.

3. **Stockfish move promise may hang if no `bestmove` arrives** (medium)
   - Evidence: `src/hooks/useStockfish.ts` `getEngineMove` sets `pendingMoveRef`, resolved only on `bestmove` (line ~157 onward), no timeout.
   - Impact: local game can get stuck in thinking state.
   - Improvement: add watchdog timeout + controlled recovery path.

4. **Hardcoded stockfish worker filename/path is brittle** (medium)
   - Evidence: `new Worker('/stockfish/stockfish-17.1-lite-single-03e3232.js')` line ~178.
   - Impact: asset hash/file rename breaks engine in production.
   - Improvement: resolve via bundler/static manifest or env-configured path.

5. **Silent error swallowing in critical UI flows** (medium)
   - Evidence: multiple `catch {}` and “ignore for MVP” patterns (`ChessGame.tsx`, `GamesIndex.tsx` line ~18).
   - Impact: hard to diagnose field issues and user confusion.
   - Improvement: structured error reporting + user-visible retry context.

---

## 3) Performance and efficiency opportunities

1. **Repeated expensive board reconstruction and sorting on render paths** (medium)
   - Evidence: frequent `new Chess(...)`, repeated `sort(...)`, `buildDisplayFen`, `buildMoveHistory` in `src/pages/ChessGame.tsx`.
   - Impact: avoidable CPU cost on move-heavy games / lower-end devices.
   - Improvement: memoize normalized move list once, cache FEN snapshots by ply.

2. **Threat mode is computationally heavy** (medium-high)
   - Evidence: nested loops + per-piece move generation + additional board creation in `threatStyles` (`ChessGame.tsx` lines ~234-319).
   - Impact: UI lag when toggled on (especially mobile).
   - Improvement: compute incrementally, throttle/debounce, or run in web worker.

3. **User search triggers network on every keystroke** (medium)
   - Evidence: `GamesIndex.tsx` `handleSearch` calls `searchUsers(v)` directly on input change (lines ~24-28, ~46).
   - Impact: unnecessary request load and racey UI results.
   - Improvement: debounce + cancel stale requests.

4. **Realtime move insertion re-sorts entire list on each insert** (low-medium)
   - Evidence: `useGameRealtime.ts` appends then `next.sort(...)` for every event.
   - Improvement: insert by ply index or trust monotonic feed with occasional reconciliation.

---

## 4) UX/UI improvements

1. **No board orientation by player color** (high UX)
   - Evidence: no `boardOrientation`/flip prop in `ChessGame.tsx`.
   - Impact: black players may view from white perspective.
   - Improvement: orient board based on role.

2. **No explicit game-end messaging/reason panel** (medium)
   - Impact: users do not clearly see checkmate/stalemate/resignation/abort reasons.

3. **Move history not directly clickable for jump-to-ply** (low-medium)
   - Impact: navigation slower than necessary; only undo/redo buttons currently.

4. **Restart action lacks confirmation and role constraints in UI** (medium)
   - Impact: accidental resets and potential game disruption.

5. **No underpromotion picker** (also correctness), no keyboard move input, limited accessibility affordances** (medium)
   - Improvement: add promotion modal + stronger keyboard/screen-reader support.

---

## 5) Testing and quality readiness gaps

1. **Chess page tests are shallow and largely mocked** (high)
   - Evidence: `src/pages/ChessGame.test.tsx` uses `// @ts-nocheck` (line 1), mocked chessboard (line ~95), mostly render-level assertions.
   - Impact: limited confidence on move legality flows, realtime sync, restart behavior, and race conditions.

2. **No evidence of adversarial/cheat-path tests at DB layer** (high)
   - Especially important given client-supplied FEN trust boundary.

3. **No robust end-to-end checks for multiplayer consistency** (medium)
   - Improvement: add two-client e2e scenarios (turn enforcement, restart sync, reconnect recovery).

---

## 6) Why this is not “Google production ready” yet

Key missing traits:
1. **Authoritative server validation for game state** (anti-cheat/integrity).
2. **Comprehensive realtime consistency model** (insert/update/delete + game row sync).
3. **Stronger reliability controls** (timeouts, retries, idempotency, transactional APIs).
4. **Observability and operability** (structured logs, metrics, traces, alerting for engine/realtime failures).
5. **Higher test maturity** (DB policy tests, deterministic multiplayer e2e, chaos/race tests).
6. **A11y and UX completeness for chess domain** (orientation, promotions, end-state clarity).

---

## 7) Suggested triage order

1. **P0 Security/Integrity**: server-side move legality + authoritative FEN derivation.
2. **P0 Consistency**: realtime restart/delete/game status synchronization.
3. **P1 Robustness**: transactional game creation, engine timeout/recovery.
4. **P1 Correct UX**: orientation + promotion chooser + explicit game-end outcomes.
5. **P2 Perf/Scale**: optimize threat-analysis and board recomputation paths.
6. **P2 Testing**: replace shallow mocks with integration/e2e coverage on real behavior.

---

If useful, next pass can convert this brainstorm into a concrete issue tracker format (priority, owner, acceptance criteria, test plan) without changing code.