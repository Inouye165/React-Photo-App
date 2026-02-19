# PR Documentation: Auth, Realtime Chat, Database Schema, and Story Audio Stabilization

## Summary
This PR consolidates a set of reliability and security fixes across authentication/onboarding, realtime chat, database migrations, and story narration audio. The changes resolve user-impacting loops, close policy gaps, align schema expectations, and harden narration fallback behavior in local and development environments.

## 1) Auth/Onboarding Infinite Loop
### Problem
Users could be forced back into onboarding due to expected password-validation responses being treated as fatal auth failures.

### Fix
- Corrected password update error handling to treat expected `422` validation outcomes as non-terminal.
- Prevented unnecessary session teardown/sign-out paths from triggering onboarding loops.
- Kept true auth failures as blocking behavior.

### Result
- Password validation errors no longer cause redirect loops.
- Users can complete onboarding and re-login flows consistently.

## 2) Realtime Chat
### Problem
Realtime subscriptions and chat policy behavior were unstable due to RLS edge cases and publication alignment issues.

### Fix
- Closed the `is_room_member` RLS leak scenario and aligned policy checks to secure room membership evaluation.
- Ensured required chat tables are published for realtime.
- Removed dependence on polling fallback where secure realtime behavior is restored.

### Result
- Realtime delivery works under intended RLS boundaries.
- Policy behavior is more consistent and secure.

## 3) Database Schema
### Problem
Runtime chat/unread flows depended on schema elements and permissions that were not consistently applied in local state.

### Fix
- Applied migrations for:
  - `room_members.last_read_at`
  - room creator permissions / creator select-insert compatibility
- Reconciled migration behavior to match current app query/policy assumptions.

### Result
- Unread/read tracking queries no longer fail on missing columns.
- Room creation and related policy checks behave as expected.

## 4) Story Audio
### Problem
Narration could fail when precomputed object references existed in cache/manifest but storage objects were missing, or when server/runtime precompute scripts encountered local execution issues.

### Fix
- Implemented robust browser-speech fallback path in narration flow when server-side TTS is unavailable.
- Added local diagnostics and safer story-audio cache handling:
  - reject stale/missing precomputed object URLs (`400/404`) and fall back to runtime ensure
  - avoid reusing incompatible/ephemeral URLs
- Stabilized local precompute pipeline execution and environment loading behavior for script runtime.

### Result
- Narration playback is resilient across precomputed and runtime modes.
- Missing precomputed files no longer dead-end playback.
- Local diagnostics are clearer for setup and troubleshooting.

## Validation
- Full project test suite executed and passing before squash.
- Story precompute verification confirms expected manifest/object availability.
- Runtime status and ensure probes confirm TTS/storage path readiness.

## Risk and Rollback
### Risk
Low-to-moderate. Most changes are targeted guards, migration alignment, and runtime resilience behavior.

### Rollback
- Revert squashed commit.
- Re-apply only unaffected migration set if partial rollback is needed.
- Restore prior story-audio behavior only if required for emergency triage.
