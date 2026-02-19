## Summary
This PR delivers a consolidated stabilization pass across authentication/onboarding, realtime chat security, schema alignment, and story narration audio reliability.

The branch was squashed into a single commit to provide a clean, auditable integration point for review.

## Scope of Fixes

### 1) Auth/Onboarding Infinite Loop
- Fixed onboarding loop behavior caused by handling expected `422` password validation responses as hard auth failures.
- Preserved session continuity for non-terminal password validation outcomes.
- Added/updated regression coverage for onboarding and re-login flow stability.

### 2) Realtime Chat
- Fixed RLS behavior around `is_room_member` to eliminate leakage edge cases and enforce intended membership boundaries.
- Ensured required realtime publications are present for chat tables.
- Restored secure realtime behavior without relying on polling fallback.

### 3) Database Schema and Permissions
- Applied migrations to support unread tracking and room access consistency, including:
  - `room_members.last_read_at`
  - room creator permission/select compatibility fixes
- Aligned schema/policy assumptions used by chat and unread query paths.

### 4) Story Audio Reliability
- Improved narration flow resilience:
  - browser-speech fallback behavior when server TTS is unavailable
  - diagnostics for local troubleshooting
- Hardened precomputed/runtime resolution logic:
  - reject stale/missing precomputed URLs (`400/404`)
  - evict invalid local cache entries and fall back to runtime ensure path
- Stabilized local precompute pipeline and script runtime behavior for env/logger/module loading.

## Validation
- Full project test suite: **pass** (`29 passed, 0 failed`).
- Story precompute verification: **pass** (`missing: 0`).
- Runtime story-audio probe (`status` + `ensure`): **pass**.
- Precomputed object retrieval probe (page 2): **pass** (HTTP `206`).

## Operational Notes
- Normal `npm run build` does **not** generate story audio assets.
- Precompute command remains:
  - `npm run story:precompute-audio-assets`
- Verification command:
  - `npm run story:verify-precomputed-audio`

## Risk Assessment
- **Risk level:** Low to moderate.
- Changes are focused and targeted to known failure points (auth handling, policy/schema drift, narration path hardening).
- Validation includes both automated tests and direct runtime endpoint checks.

## Rollback Plan
- Revert the squashed commit if any regression is identified.
- Re-apply only migration components selectively if partial rollback is required.
