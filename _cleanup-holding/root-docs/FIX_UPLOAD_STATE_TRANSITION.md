# Fix: Photo Upload State Transition

## Problem
After merging all the "infinite analyzing loop" fixes (dual-mode polling, stale state protection), production showed that photos were uploaded but stuck with no polling activity. Investigation revealed the root cause:

**The photo never transitioned from 'working' to 'inprogress' state after upload**, so the client-side polling system and server-side workers had no visibility that AI processing was queued.

## Root Cause Analysis

### Upload Flow
1. Client uploads photo → server creates DB record with `state: 'working'`
2. Server queues AI job via `addAIJob(photoId, { processMetadata: true, generateThumbnail: true })`
3. Server returns success response to client
4. **MISSING**: Server never transitions photo to 'inprogress' state
5. Client calls `startAiPolling(photoId)` but photo remains in 'working' state
6. Worker processes the job but photo state is never updated in real-time

### Why This Matters
- The 'inprogress' state signals to both client and server that AI processing is active
- Client polling logic uses state transitions to update UI (e.g., clearing "Analyzing..." spinner)
- Without this transition, the photo appears "stuck" in working state indefinitely

## Solution
Modified [server/routes/uploads.js](server/routes/uploads.js#L265-L281) to immediately transition the photo to 'inprogress' after successfully queuing the AI job:

```javascript
// After queuing AI job
if (redisAvailable) {
  await addAIJob(insertedPhoto.id, {
    processMetadata: true,
    generateThumbnail: true
  });
  jobEnqueued = true;
  
  // CRITICAL: Transition photo from 'working' to 'inprogress'
  await db('photos')
    .where({ id: photoId })
    .update({
      state: 'inprogress',
      updated_at: new Date().toISOString(),
    });
  logger.info('[upload] Photo transitioned to inprogress', { photoId, userId: req.user.id });
}
```

## Impact
- ✅ Photos now correctly transition to 'inprogress' immediately after AI job is queued
- ✅ Client polling can track AI processing state in real-time
- ✅ UI updates correctly when AI analysis completes
- ✅ Fixes the "infinite analyzing loop" symptom where photos appeared stuck
- ✅ All existing upload tests pass (10/10 passing)

## Testing
1. Upload a photo with classification (not 'none')
2. Verify photo appears in database with `state: 'inprogress'` (not 'working')
3. Verify client-side polling starts and tracks AI processing
4. Verify photo eventually transitions to 'finished' state with AI metadata

## Related PRs
- PR #363: Dual-mode polling (removed SSE guard clauses)
- PR #364: Stale state protection
- PR #366: Removed final duplicate guard clause
- This fix: State transition after upload

## Branch
`debug/analyze-polling-not-triggering`
