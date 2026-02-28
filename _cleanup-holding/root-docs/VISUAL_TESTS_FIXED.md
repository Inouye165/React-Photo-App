# Visual Regression Tests - Fixed ✅

## Summary

Successfully fixed all 6 EditPage visual regression tests to work without backend/database and without modifying application code.

## Test Results

```
✓ 6 passed (59.8s)
  ✓ Default Story tab state (21.1s)
  ✓ Location tab with GPS data (8.0s)
  ✓ Collectibles tab with feature flag enabled (7.1s)
  ✓ Processing/polling state (5.2s)
  ✓ Flipped metadata view (4.5s)
  ✓ Story tab form fields with focus (4.9s)
```

## Key Changes

### 1. Playwright Configuration ([playwright.config.ts](playwright.config.ts))
- Single Vite webServer on `http://127.0.0.1:5173`
- Environment variables:
  - `VITE_E2E=true` - Enables E2E mode in app
  - `VITE_API_URL=http://127.0.0.1:5173` - Routes API calls to Vite dev server

### 2. Test File ([e2e/editpage-visual.spec.ts](e2e/editpage-visual.spec.ts))
- **Inline mock data**: No external dependencies on helpers
- **Consolidated route handler**: Single `page.route('**/*')` with resourceType filtering
  - Skips Vite assets (document/script/stylesheet)
  - Mocks all API endpoints inline
- **Gallery-first navigation**: Load `/gallery` → populate store → click photo card → React Router navigate
- **Fixed tab selectors**: Changed from `role="tab"` to `role="button"` (actual implementation)

### 3. Documentation ([docs/VISUAL_REGRESSION_TESTING.md](docs/VISUAL_REGRESSION_TESTING.md))
- Updated with correct run commands
- Added debug mode instructions

## Root Cause Analysis

### Problem
Tests were failing with "Story tab not visible" despite successful navigation to EditPage.

### Investigation
1. ✅ Gallery loads successfully (2 photo cards visible)
2. ✅ Mock endpoint `/photos` returns 2 photos
3. ✅ Navigation reaches correct URL
4. ✅ Photo found in store (no "Photo not found" message)
5. ❌ Tab selector failed: `getByRole('tab', { name: /story/i })`

### Solution
The EditTabs component ([src/components/edit/EditTabs.tsx](src/components/edit/EditTabs.tsx)) renders plain `<button>` elements without `role="tab"` attributes. Updated all test selectors from `getByRole('tab', ...)` to `getByRole('button', ...)`.

## Mock Architecture

### Route Handler Pattern
```typescript
await page.route('**/*', async (route) => {
  const resourceType = route.request().resourceType();
  
  // Skip Vite assets - let them load normally
  if (resourceType === 'document' || resourceType === 'script' || resourceType === 'stylesheet') {
    return route.continue();
  }
  
  const pathname = new URL(route.request().url()).pathname;
  const isApi = pathname.startsWith('/api/') || pathname === '/photos' || ...;
  
  if (!isApi) return route.continue();
  
  // Mock specific endpoints
  if (pathname === '/api/test/e2e-verify') { ... }
  if (pathname === '/photos') { ... }
  // ... more endpoints
});
```

### Navigation Pattern
```typescript
// 1. Load gallery to populate store
await page.goto('http://127.0.0.1:5173/gallery?view=working', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// 2. Wait for photo cards
await page.waitForSelector('[data-testid="photo-card"]', { state: 'visible' });

// 3. Click to trigger React Router navigation (preserves store)
await page.locator('[data-testid="photo-card"]').first().click();

// 4. Wait for URL change
await page.waitForURL(/\/photos\/\d+\/edit/);

// 5. Verify page loaded
await expect(page.getByRole('button', { name: /story/i })).toBeVisible();
```

## Running the Tests

```bash
# Run all visual tests
npx playwright test e2e/editpage-visual.spec.ts

# Run with visible browser
npx playwright test e2e/editpage-visual.spec.ts --headed

# Run specific test
npx playwright test e2e/editpage-visual.spec.ts --grep "Default Story"

# Debug mode
npx playwright test e2e/editpage-visual.spec.ts --headed --debug --max-failures=1

# Update baseline snapshots
npx playwright test e2e/editpage-visual.spec.ts --update-snapshots
```

## Files Modified

1. [playwright.config.ts](playwright.config.ts)
   - Changed baseURL and webServer.url to `http://127.0.0.1:5173`
   - Set environment variables for E2E mode

2. [e2e/editpage-visual.spec.ts](e2e/editpage-visual.spec.ts)
   - Complete rewrite with inline mocks
   - Consolidated route handler
   - Gallery-first navigation
   - Fixed tab selectors (role="button" instead of role="tab")
   - Added force click for textarea in last test

3. [docs/VISUAL_REGRESSION_TESTING.md](docs/VISUAL_REGRESSION_TESTING.md)
   - Updated run commands

## Files Analyzed (Not Modified)

- [src/pages/PhotoEditPage.jsx](src/pages/PhotoEditPage.jsx) - Photo lookup and EditPage rendering
- [src/pages/PhotoGalleryPage.jsx](src/pages/PhotoGalleryPage.jsx) - Navigation handlers
- [src/EditPage.tsx](src/EditPage.tsx) - Main edit page component
- [src/components/edit/EditTabs.tsx](src/components/edit/EditTabs.tsx) - Tab component (identified button elements)

## Next Steps

✅ **All requirements met** - Visual tests working without backend/DB and without app code changes.

No further action required.
