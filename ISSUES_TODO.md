# Repo Issues / TODO Scan (2026-02-14)

## Scope
Quick local scan for dead code signals, spaghetti hotspots, and clearly wrong/fragile patterns.

## Findings

1. **Dead-code signal from architecture scan**
   - `npm run test:arch` reports a large number of `no-orphans` warnings (mostly under `server/`, including scripts and `server/dist` artifacts).
   - This strongly suggests code that is no longer referenced or duplicate build output tracked in source control.

2. **Mixed source + generated artifacts in VCS**
   - Both `server/` source files and `server/dist/` compiled files appear in architecture warnings.
   - Keeping generated output tracked increases review noise and creates maintenance drift risk.

3. **Logging noise in test/dev output**
   - During full-suite runs, repeated browser/server warnings are emitted (expected in current tests but noisy), making true regressions harder to spot quickly.
   - Example categories seen: auth 403 during mocked E2E contexts, UUID-format errors in unread-message calls for test IDs.

4. **Large JS surface area in backend**
   - The server has hundreds of `.js` files with partial TS adoption.
   - This slows strict type adoption and increases chance of runtime-only errors in shared utility modules.

5. **Potential spaghetti hotspots**
   - Route and service modules with broad responsibilities (e.g., multi-concern files under `server/routes` and `server/services`) are harder to reason about and test in isolation.

## Recommended TODOs

- [ ] Decide policy for `server/dist` tracking (prefer build artifact exclusion if deployment allows).
- [ ] Triage `no-orphans` list from `test:arch` into: keep, delete, or wire-in.
- [ ] Add a small "noise budget" policy for expected test warnings and suppress/normalize known benign logs.
- [ ] Continue JS→TS replacement in standalone scripts/utilities first, then route/service internals.
- [ ] Split high-churn multi-concern route files into smaller handlers + pure helpers with focused tests.

## Changes done in this pass

- Replaced `server/scripts/check-auth-state.js` with `server/scripts/check-auth-state.ts`.
- Replaced `server/scripts/check-token.js` with `server/scripts/check-token.ts`.
- Removed temporary local snippet `supabase/snippets/Untitled query 520.sql`.
