# Visual Regression Testing - EditPage (Phase 6)

## Overview

Phase 6 adds visual regression testing for EditPage using Playwright screenshot comparisons. This ensures UI consistency across code changes and refactoring.

## Test Coverage

The visual regression suite covers these key EditPage states:

1. **Default Story Tab** - Base editing interface with caption, description, keywords
2. **Location Tab** - Map display with GPS data
3. **Collectibles Tab** - Collectibles UI (feature flag enabled)
4. **Processing State** - "Processing..." indicator during AI analysis
5. **Flipped Metadata View** - Back-of-card metadata display
6. **Form Focus States** - Active input field styling

## Running Visual Tests

### Locally (Frontend-Only)

Visual tests run **WITHOUT requiring a backend server or database**. All API calls are mocked via Playwright.

```bash
# CI-like run (headless, strict pixel-parity)
npx playwright test e2e/editpage-visual.spec.ts

# Headed run (allows minor rendering differences)
npx playwright test e2e/editpage-visual.spec.ts --headed

# Run specific test by name
npx playwright test e2e/editpage-visual.spec.ts --headed --grep "Default Story"

# Debug mode (pauses at each step, interactive)
npx playwright test e2e/editpage-visual.spec.ts --headed --debug --grep "Default Story" --max-failures=1 --retries=0

# Update snapshots ONLY after approved UI changes
# Fix determinism issues first before updating snapshots
npx playwright test e2e/editpage-visual.spec.ts --update-snapshots
```

**Important**: Headed runs automatically allow small tolerances to handle focus rings, hover states, and compositor differences:
- Most tests: `maxDiffPixelRatio: 0.015` (1.5%)
- Location tab: `maxDiffPixelRatio: 0.12` (12%) due to map tile rendering variability

CI/headless runs remain strict with zero tolerance for pixel-perfect comparison.

### CI/CD

Visual tests can be run in CI as part of the E2E test suite:

```bash
npm run test:e2e
```

**Note**: Only the **Vite frontend** is started. The backend server (port 3001) is NOT required.

## Snapshot Management

### When Snapshots Fail

1. **Verify the change is intentional** - Review diff images in `test-results/`
2. **Check for flaky tests** - Rerun to ensure consistent failures
3. **Update snapshots** if the visual change is approved:
   ```bash
   npm run test:e2e -- editpage-visual.spec.ts --update-snapshots
   ```
4. **Commit updated snapshots** with clear explanation in PR description

### Snapshot Locations

- **Baseline snapshots**: `e2e/editpage-visual.spec.ts-snapshots/`
- **Diff images**: `test-results/` (generated on failure)
- **Platform-specific**: Snapshots may vary by OS (Windows/Linux/macOS)

## Configuration

Visual tests use these stable settings (from [editpage-visual.spec.ts](../e2e/editpage-visual.spec.ts)):

- **Frontend-Only**: No backend/DB required (all API calls mocked)
- **Viewport**: 1280x720 (consistent across runs)
- **Reduced Motion**: Enabled (prevents animation flakiness)
- **Timeout**: 10s per screenshot
- **Animations**: Disabled during capture
- **Mocked Data**: Deterministic photo/user/collectible data from `e2e/helpers/mockEditPageData.ts`

## Design Tokens (Optional)

Phase 6 also introduces CSS custom properties in [src/styles/tokens.css](../src/styles/tokens.css):

```css
/* Example tokens */
--color-text-primary: #1e293b;
--radius-lg: 8px;
--spacing-md: 12px;
```

**Important**: Tokens are defined but NOT yet applied to maintain pixel parity. Future phases can migrate inline styles to use these tokens.

## Troubleshooting

### Flaky Snapshots in Headed Mode

**Symptom**: Tests pass in headless but fail in headed mode with tiny diffs (~0.01 pixel ratio)

**Cause**: Focus rings, hover tooltips, and compositor rendering differ between headed/headless

**Solution**: Already implemented! The test suite includes:
- **Stabilization helper**: Blurs active element, moves mouse to (0,0), waits 100ms before screenshots
- **Headed tolerance**: Allows `maxDiffPixelRatio: 0.015` only in headed runs
- **CI/headless**: Remains strict (zero tolerance for pixel-perfect verification)

### CI vs Local Snapshots

**Symptom**: Tests pass locally but fail in CI (or vice versa) with large diffs

**Causes**:
- Font rendering differences (Windows vs Linux)
- Timing issues (images not loaded)
- Platform-specific browser rendering

**Solutions**:
```bash
# Generate platform-specific snapshots on CI platform
npm run test:e2e -- editpage-visual.spec.ts --update-snapshots

# Increase wait times in spec if needed
await page.waitForTimeout(1000); // Allow for loading
```

**Policy**: Update snapshots ONLY after:
1. Verifying the visual change is intentional and approved
2. Confirming tests are deterministic (not flaky)
3. Running both headless and headed modes locally

### Mock Data Not Appearing

**Symptom**: Blank/error states in screenshots

**Solutions**:
- Check route mocking in `beforeEach` hook
- Verify photo ID matches mock data (999 or 1000)
- Inspect mock data in `e2e/helpers/mockEditPageData.ts`
- Check console for unhandled API routes: `[Visual Test] Unhandled API route`

### Backend Server Errors

**Symptom**: `Error: Process from config.webServer was not able to start`

**Solution**: Visual tests are **frontend-only**. The backend server should NOT be started. Verify `playwright.config.ts` only starts the Vite dev server (port 5173), not the backend server (port 3001).

### Snapshot Size Too Large

**Symptom**: Git diff shows huge binary changes

**Solutions**:
- Use `fullPage: false` (captures viewport only)
- Consider threshold tolerance: `maxDiffPixels: 100`
- Compress images if stored long-term

## Phase 6 Constraints

✅ **NO behavior changes** - Logic remains identical  
✅ **NO visual changes** - Pixel-perfect parity with Phase 5  
✅ **Tokens defined** - But not yet applied to avoid visual diff  
✅ **Full test coverage** - Unit + visual regression passing  

## Next Steps (Future Phases)

- Migrate CSS Modules to use design tokens
- Add visual regression for mobile viewports
- Test dark mode (if implemented)
- Add visual tests for error states

---

**Created**: Phase 6 - December 2025  
**Last Updated**: December 14, 2025
