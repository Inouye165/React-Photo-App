# AI Polling and Processing Fix

## Issues Identified

### 1. AI Router JSON Parsing Failure
**Problem**: The OpenAI router agent was returning JSON wrapped in markdown code fences:
```
"content": "```json\n{ \"classification\": \"receipt\" }\n```"
```

The parser wasn't unwrapping this before attempting JSON.parse(), causing the classification extraction to fail.

**Error Log**:
```
[AI Router] Could not extract classification from routerResult
AI processing failed for 20231023_235814447_iOS.heic (attempt 1): Unknown classification from routerAgent: undefined
```

### 2. Infinite Frontend Polling
**Problem**: When AI processing failed, the photo remained in "inprogress" state with placeholder values like "AI processing failed" in the caption/description fields. The frontend polling logic didn't recognize these failure markers and continued polling indefinitely (every 3 seconds).

**Evidence**: Your logs show dozens of identical polling requests:
```
[REQUEST] GET /photos/86?_cb=1762369306827
[REQUEST] GET /photos/86?_cb=1762369309835
[REQUEST] GET /photos/86?_cb=1762369312832
... (continues for 30+ attempts)
```

## Solutions Applied

### Fix 1: Unwrap Markdown Code Fences in Router Parser
**File**: `server/ai/service.js`

Added `unwrapMarkdownJson()` call before parsing the router result:

```javascript
if (routerContent) {
  // Unwrap markdown code fences before parsing
  const unwrappedContent = unwrapMarkdownJson(routerContent);
  try {
    const parsedRouter = JSON.parse(unwrappedContent);
    // ... rest of parsing logic
  }
}
```

The `unwrapMarkdownJson()` function was already defined but wasn't being used at this critical extraction point.

### Fix 2: Detect AI Processing Failures in Frontend Polling
**File**: `src/hooks/useAIPolling.jsx`

Updated the `hasNewAIdata()` function to detect the "AI processing failed" marker:

```javascript
const hasNewAIdata = (p) => {
  if (!p) return false;
  const c = (p.caption || '').toString().trim();
  const d = (p.description || '').toString().trim();
  const k = (p.keywords || '').toString().trim();
  
  // Check if AI processing failed permanently
  const failedMarker = 'ai processing failed';
  if (c.toLowerCase() === failedMarker || d.toLowerCase() === failedMarker) {
    return true; // Stop polling - AI failed
  }
  
  return (
    (!!c && c !== originalAI.current.caption) ||
    (!!d && d !== originalAI.current.description) ||
    (!!k && k !== originalAI.current.keywords)
  );
};
```

Also added user-friendly error notification:

```javascript
// Check if AI processing failed
const failedMarker = 'ai processing failed';
const caption = (updated.caption || '').toString().toLowerCase();
const description = (updated.description || '').toString().toLowerCase();
if (caption === failedMarker || description === failedMarker) {
  setToast({ message: 'AI processing failed for this photo', severity: 'error' });
}
```

## Expected Behavior After Fix

1. ✅ Router agent properly extracts classification from markdown-wrapped JSON
2. ✅ AI processing proceeds through the pipeline normally
3. ✅ If AI processing fails permanently (after 5 retries), frontend detects the failure marker
4. ✅ Polling stops immediately when failure is detected
5. ✅ User sees clear error message about AI processing failure
6. ✅ No more infinite polling loops

## Testing

Restart your server and test:
```bash
cd server
npm start
```

Try moving a photo to "inprogress" state and verify:
- AI processing completes successfully with proper classification
- If it fails, polling stops after detecting the failure marker
- No excessive polling requests in the logs
