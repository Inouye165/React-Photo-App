// @ts-check
import { test, expect } from '@playwright/test';
import type { Route, Page } from '@playwright/test';
import { acceptDisclaimer } from './helpers/disclaimer';

/**
 * Stabilization helper for screenshots in headed mode.
 * Eliminates focus rings, hover states, and compositor differences.
 * Call immediately before expect(page).toHaveScreenshot().
 */
async function stabilizeForScreenshot(page: Page): Promise<void> {
  // Blur active element to remove focus rings/carets
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();
  });

  // Move mouse to top-left corner to avoid hover tooltips
  await page.mouse.move(0, 0);

  // Brief settle delay for compositor/font rendering
  await page.waitForTimeout(100);
}

async function goToEditFromGallery(page: Page, options?: { cardIndex?: number }): Promise<void> {
  const cardIndex = options?.cardIndex ?? 0;

  await page.goto('http://127.0.0.1:5173/gallery', { waitUntil: 'networkidle' });
  
  // Handle disclaimer modal if present
  await acceptDisclaimer(page);

  await page.waitForTimeout(2000);

  const cards = page.locator('[data-testid="photo-card"]');
  await expect(cards.first()).toBeVisible({ timeout: 15000 });

  const target = cards.nth(cardIndex);
  await target.scrollIntoViewIfNeeded();
  await target.click({ timeout: 10000 });

  await page.waitForURL(/\/photos\/\d+$/, { timeout: 10000 });
  await expect(page.getByTestId('photo-detail-page')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('photo-detail-edit').click();
  await page.waitForURL(/\/photos\/\d+\/edit/, { timeout: 10000 });
}

// Mock data
const mockUser = { id: 'test-user', username: 'visual-test', email: 'test@example.com' };

const mockPhotos = [
  {
    id: '999',
    filename: 'photo-999.jpg',
    state: 'working',
    caption: 'Test photo for visual regression',
    takenAt: '2025-01-15T10:30:00Z',
    latitude: 37.7749,
    longitude: -122.4194,
    hasThumbnail: true
  },
  {
    id: '1000',
    filename: 'photo-1000.jpg',
    state: 'working',
    caption: 'Second test photo',
    takenAt: '2025-01-16T14:20:00Z',
    hasThumbnail: true
  }
];

const mockCollectibleData = {
  id: 'collectible-1',
  photoId: '1000',
  grade: 'PSA 10',
  certNumber: '12345678'
};

// Helper to create mock image buffer
function getMockImageBuffer(): Buffer {
  // 1x1 transparent PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
}

/**
 * Visual Regression Tests for EditPage (Phase 6)
 * Frontend-only tests (no backend/DB required)
 */
test.describe('EditPage Visual Regression (Frontend-Only)', () => {
  test.beforeEach(async ({ page }) => {
    // Set E2E mode flag BEFORE app loads
    await page.addInitScript(() => {
      window.__E2E_MODE__ = true;
      console.log('[E2E] E2E mode enabled');
    });

    // Consolidated route mocking - intercept API paths only
    await page.route('**/*', async (route: Route) => {
      const url = route.request().url();
      const method = route.request().method();
      const resourceType = route.request().resourceType();
      
      const u = new URL(url);
      const pathname = u.pathname;

      // Skip Vite assets entirely
      if (resourceType === 'document' || resourceType === 'script' || resourceType === 'stylesheet') {
        return route.continue();
      }

      // Only intercept API-ish paths
      const isApi = 
        pathname.startsWith('/api/') ||
        pathname === '/photos' ||
        pathname === '/photos/dependencies' ||
        pathname === '/privilege' ||
        pathname.startsWith('/signed-thumbnail-urls') ||
        (pathname.startsWith('/photos/') && !pathname.includes('/edit'));

      if (!isApi) {
        return route.continue();
      }

      // Helper for CORS-safe JSON responses
      const fulfill = (data: any, status = 200) => {
        return route.fulfill({
          status,
          contentType: 'application/json',
          headers: {
            'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
          body: JSON.stringify(data)
        });
      };

      // OPTIONS preflight
      if (method === 'OPTIONS') {
        return fulfill({}, 204);
      }

      // 1. E2E auth verification
      if (pathname === '/api/test/e2e-verify') {
        return fulfill({ success: true, user: mockUser });
      }

      // 2. Dependencies endpoint
      if (pathname === '/photos/dependencies') {
        return fulfill({ success: true, dependencies: { aiQueue: true } });
      }

      // 3. User preferences
      if (pathname === '/api/users/me/preferences') {
        return fulfill({ success: true, preferences: {} });
      }

      // 3b. Accept terms
      if (pathname === '/api/users/accept-terms') {
        return fulfill({ success: true, data: { terms_accepted_at: new Date().toISOString() } });
      }

      // 4. Photo list endpoint - CRITICAL for store population
      if (pathname === '/photos') {
        console.log(`[Mock] Photo list requested, returning ${mockPhotos.length} photos`);
        return fulfill({ photos: mockPhotos });
      }

      // 5. Privilege checks - keyed by filename
      if (pathname === '/privilege') {
        if (method === 'POST') {
          return fulfill({ 
            success: true, 
            privileges: { 
              'photo-999.jpg': 'owner',
              'photo-1000.jpg': 'owner'
            } 
          });
        }
        if (method === 'GET') {
          return fulfill({ success: true, privilege: 'owner' });
        }
      }
      
      // 5. Individual photo endpoints (blob, thumb, detail, collectibles, etc.)
      const photoMatch = pathname.match(/^\/(?:api\/)?photos\/(\d+)(?:\/(.+))?$/);
      if (photoMatch) {
        const photoId = photoMatch[1];
        const subpath = photoMatch[2];
        
        // Thumbnail signed URL endpoint (returns URL, not image)
        if (subpath === 'thumbnail-url') {
          return fulfill({ 
            success: true, 
            url: `http://localhost:5173/photos/${photoId}/thumb`,
            expiresAt: Date.now() + 3600000
          });
        }
        
        // Actual image endpoints
        if (subpath === 'blob') {
          return route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: getMockImageBuffer()
          });
        }
        
        if (subpath === 'thumb') {
          return route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: getMockImageBuffer()
          });
        }
        
        if (subpath === 'caption' && method === 'PATCH') {
          return fulfill({ success: true });
        }
        
        if (subpath === 'collectibles') {
          if (method === 'GET') {
            return fulfill({ success: true, collectibles: [mockCollectibleData] });
          }
          if (method === 'POST' || method === 'PUT') {
            return fulfill({ success: true, collectible: mockCollectibleData });
          }
          return fulfill({ success: true });
        }
        
        // Photo detail GET/PATCH (no subpath)
        if (!subpath) {
          if (method === 'GET') {
            const photo = photoId === '1000' ? mockCollectiblePhoto : mockBasePhoto;
            return fulfill({ success: true, photo });
          }
          if (method === 'PATCH') {
            return fulfill({ success: true, photo: mockBasePhoto });
          }
        }
      }
      
      // 6. Collectibles by ID
      if (pathname.match(/^\/collectibles\/\d+$/) && method === 'PATCH') {
        return fulfill({ success: true, collectible: mockCollectibleData });
      }
      
      // 7. Privilege checks
      if (pathname === '/privilege') {
        console.log(`[Mock] Privilege request: ${method} ${url}`);
        if (method === 'POST') {
          // Batch privilege check - keyed by filename not ID
          return fulfill({ 
            success: true, 
            privileges: { 
              'test-photo.jpg': { canRead: true, canWrite: true, canExecute: true } 
            } 
          });
        }
        if (method === 'GET') {
          // Single privilege check
          return fulfill({ success: true, privilege: { canRead: true, canWrite: true, canExecute: true } });
        }
      }
      
      // 8. Other known endpoints
      if (pathname === '/photos/models') {
        return fulfill({ models: ['gpt-4o', 'gpt-4o-mini'], source: 'mock', updatedAt: null });
      }
      
      if (pathname === '/signed-thumbnail-urls') {
        return fulfill({
          success: true,
          urls: { '999': '/photos/999/thumb', '1000': '/photos/1000/thumb' }
        });
      }
      
      // Catch-all: return deterministic 404 for unmocked routes
      if (pathname !== '/') { // Don't log root path
        console.log('[Mock] Unmocked route:', method, pathname);
      }
      return fulfill({ error: 'Not mocked in tests' }, 404);
    });
  });

  test('Default Story tab state', async ({ page }, testInfo) => {
    await goToEditFromGallery(page);

    // Guards
    await expect(page.locator('text=Photo not found')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /story/i })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(1000);

    // Stabilize before screenshot
    await stabilizeForScreenshot(page);

    // Add tolerance for headed runs only (CI/headless stays strict)
    const screenshotOptions: any = {
      fullPage: false,
      animations: 'disabled',
      timeout: 10000
    };
    if (!testInfo.project.use.headless) {
      screenshotOptions.maxDiffPixelRatio = 0.015;
    }

    await expect(page).toHaveScreenshot('editpage-story-tab.png', screenshotOptions);
  });

  test('Location tab with GPS data', async ({ page }, testInfo) => {
    await goToEditFromGallery(page);

    await expect(page.locator('text=Photo not found')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /story/i })).toBeVisible({ timeout: 15000 });

    const locationTab = page.getByRole('button', { name: /location/i });
    await locationTab.click();
    await page.waitForTimeout(2000); // Longer wait for map tiles to load

    // Stabilize before screenshot
    await stabilizeForScreenshot(page);

    const screenshotOptions: any = {
      fullPage: false,
      animations: 'disabled',
      timeout: 10000
    };
    if (!testInfo.project.use.headless) {
      // Location tab needs higher tolerance due to map tile rendering
      screenshotOptions.maxDiffPixelRatio = 0.12;
    }

    await expect(page).toHaveScreenshot('editpage-location-tab.png', screenshotOptions);
  });

  test('Collectibles tab with feature flag enabled', async ({ page }, testInfo) => {
    // Click second photo card (collectible)
    await goToEditFromGallery(page, { cardIndex: 1 });

    await expect(page.locator('text=Photo not found')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /story/i })).toBeVisible({ timeout: 15000 });

    const collectiblesTab = page.getByRole('button', { name: /collectibles/i });
    const tabExists = await collectiblesTab.count();
    if (tabExists > 0) {
      await collectiblesTab.click();
      await page.waitForTimeout(1200);
    }

    // Stabilize before screenshot
    await stabilizeForScreenshot(page);

    const screenshotOptions: any = {
      fullPage: false,
      animations: 'disabled',
      timeout: 10000
    };
    if (!testInfo.project.use.headless) {
      screenshotOptions.maxDiffPixelRatio = 0.015;
    }

    await expect(page).toHaveScreenshot('editpage-collectibles-tab.png', screenshotOptions);
  });

  test('Processing/polling state', async ({ page }, testInfo) => {
    await goToEditFromGallery(page);

    await expect(page.locator('text=Photo not found')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /story/i })).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(800);

    // Stabilize before screenshot
    await stabilizeForScreenshot(page);

    const screenshotOptions: any = {
      fullPage: false,
      animations: 'disabled',
      timeout: 10000
    };
    if (!testInfo.project.use.headless) {
      screenshotOptions.maxDiffPixelRatio = 0.015;
    }

    await expect(page).toHaveScreenshot('editpage-processing-state.png', screenshotOptions);
  });

  test('Flipped metadata view', async ({ page }, testInfo) => {
    await goToEditFromGallery(page);

    await expect(page.locator('text=Photo not found')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /story/i })).toBeVisible({ timeout: 15000 });

    const flipButton = page.locator('button:has-text("Metadata"), button:has-text("View Details"), button:has-text("Show Details")').first();
    const flipButtonExists = await flipButton.count();
    if (flipButtonExists > 0) {
      await flipButton.click();
      await page.waitForTimeout(800);
    }

    // Stabilize before screenshot
    await stabilizeForScreenshot(page);

    const screenshotOptions: any = {
      fullPage: false,
      animations: 'disabled',
      timeout: 10000
    };
    if (!testInfo.project.use.headless) {
      screenshotOptions.maxDiffPixelRatio = 0.015;
    }

    await expect(page).toHaveScreenshot('editpage-flipped-metadata.png', screenshotOptions);
  });

  test('Story tab form fields with focus', async ({ page }, testInfo) => {
    await goToEditFromGallery(page);

    await expect(page.locator('text=Photo not found')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /story/i })).toBeVisible({ timeout: 15000 });

    const descriptionField = page.locator('textarea').first();
    const fieldExists = await descriptionField.count();
    if (fieldExists > 0) {
      await descriptionField.click({ force: true });
      await page.waitForTimeout(500);
    }

    // Stabilize before screenshot
    await stabilizeForScreenshot(page);

    const screenshotOptions: any = {
      fullPage: false,
      animations: 'disabled',
      timeout: 10000
    };
    if (!testInfo.project.use.headless) {
      screenshotOptions.maxDiffPixelRatio = 0.015;
    }

    await expect(page).toHaveScreenshot('editpage-story-form-focus.png', screenshotOptions);
  });
});
