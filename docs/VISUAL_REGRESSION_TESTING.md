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

### Locally

```bash
# Run all visual regression tests
npm run test:e2e -- editpage-visual.spec.ts

# Update snapshots after intentional visual changes
npm run test:e2e -- editpage-visual.spec.ts --update-snapshots

# Run in headed mode (see browser)
npm run test:e2e -- editpage-visual.spec.ts --headed
```

### CI/CD

Visual tests run automatically in GitHub Actions as part of the E2E test suite:

```bash
npm run test:e2e
```

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

Visual tests use these stable settings (from [editpage-visual.spec.ts](e2e/editpage-visual.spec.ts)):

- **Viewport**: 1280x720 (consistent across runs)
- **Reduced Motion**: Enabled (prevents animation flakiness)
- **Timeout**: 10s per screenshot
- **Animations**: Disabled during capture

## Design Tokens (Optional)

Phase 6 also introduces CSS custom properties in [src/styles/tokens.css](src/styles/tokens.css):

```css
/* Example tokens */
--color-text-primary: #1e293b;
--radius-lg: 8px;
--spacing-md: 12px;
```

**Important**: Tokens are defined but NOT yet applied to maintain pixel parity. Future phases can migrate inline styles to use these tokens.

## Troubleshooting

### Flaky Snapshots

**Symptom**: Tests pass locally but fail in CI (or vice versa)

**Causes**:
- Font rendering differences (Windows vs Linux)
- Timing issues (images not loaded)
- CI environment differences

**Solutions**:
```bash
# Generate platform-specific snapshots
npm run test:e2e -- editpage-visual.spec.ts --update-snapshots

# Increase wait times in spec if needed
await page.waitForTimeout(1000); // Allow for loading
```

### Mock Data Not Appearing

**Symptom**: Blank/error states in screenshots

**Solutions**:
- Check route mocking in `beforeEach` hook
- Verify photo ID matches mock data
- Ensure auth cookies are set correctly

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
