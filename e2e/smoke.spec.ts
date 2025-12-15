import { test, expect } from '@playwright/test';
import { acceptDisclaimer } from './helpers/disclaimer';

test('E2E smoke: login → upload → view', async ({ page, context }) => {
  // Set E2E mode flag in window object
  await page.addInitScript(() => {
    window.__E2E_MODE__ = true;
  });

  // Mock e2e-verify endpoint
  await page.route('**/api/test/e2e-verify', async route => {
    await route.fulfill({
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
        'Access-Control-Allow-Credentials': 'true'
      },
      json: {
        success: true,
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          username: 'e2e-test',
          role: 'admin',
          email: 'e2e@example.com'
        }
      }
    });
  });

  // Provide deterministic gallery data (avoid depending on pre-seeded DB state)
  const mockPhotoId = '999';
  const now = Math.floor(Date.now() / 1000);
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Photo list
  await page.route('**/photos', async route => {
    const url = route.request().url();
    const method = route.request().method();
    // Avoid intercepting /photos/dependencies and other subpaths
    if (!url.endsWith('/photos') && !url.includes('/photos?')) {
      return route.continue();
    }

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        photos: [
          {
            id: mockPhotoId,
            filename: 'smoke-photo.jpg',
            caption: 'Smoke Test Photo',
            description: 'AI description for smoke test.',
            state: 'working',
            classification: 'scenery',
            thumbnail: `/photos/${mockPhotoId}/thumb`,
            url: `/photos/${mockPhotoId}/blob`,
            file_size: 123456,
            created_at: '2025-12-01T12:00:00Z',
            metadata: { DateTimeOriginal: '2025:12:01 12:00:00' },
          },
        ],
      }),
    });
  });

  // Dependency status
  await page.route('**/photos/dependencies', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ success: true, dependencies: { aiQueue: true } }),
    });
  });

  // Signed thumbnail URL endpoint
  await page.route(`**/photos/${mockPhotoId}/thumbnail-url`, async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ success: true, url: `/photos/${mockPhotoId}/thumb`, expiresAt: now + 3600 }),
    });
  });

  // Minimal preferences endpoint used by auth flow
  await page.route('**/api/users/me/preferences', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ success: true, preferences: {} }),
    });
  });

  // Serve tiny PNG bytes for thumbnails and blobs
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  await page.route(`**/photos/${mockPhotoId}/thumb`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: corsHeaders,
      body: png1x1,
    });
  });

  await page.route(`**/photos/${mockPhotoId}/blob`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: corsHeaders,
      body: png1x1,
    });
  });

  // E2E login: make request to get the auth cookie
  const loginResponse = await context.request.post('http://127.0.0.1:3001/api/test/e2e-login');
  expect(loginResponse.ok()).toBeTruthy();
  
  // Extract cookies from the response and add them to the browser context for localhost
  const cookies = await context.cookies('http://127.0.0.1:3001');
  
  // Re-add cookies for localhost (any port) so they're sent to port 5173 as well
  for (const cookie of cookies) {
    await context.addCookies([{
      name: cookie.name,
      value: cookie.value,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite
    }]);
  }

  // Go directly to gallery (avoid SmartRouter redirects affecting stability)
  await page.goto('http://127.0.0.1:5173/gallery', { waitUntil: 'networkidle' });
  
  // Handle disclaimer modal if present
  await acceptDisclaimer(page);

  // Wait for auth check to complete
  await page.waitForTimeout(2000);
  
  // Check for authenticated elements - user email (truncated) or logout button
  // The UI displays the part before @ (e.g. "e2e" from "e2e@example.com")
  await expect(page.getByText('e2e', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  // New primary flow: Gallery -> Detail -> Edit
  await expect(page.getByTestId('photo-card').first()).toBeVisible({ timeout: 15000 });
  await page.getByTestId('photo-card').first().click();

  await expect(page).toHaveURL(new RegExp(`/photos/${mockPhotoId}$`));
  await expect(page.getByTestId('photo-detail-page')).toBeVisible({ timeout: 10000 });

  await page.getByTestId('photo-detail-edit').click();
  await expect(page).toHaveURL(new RegExp(`/photos/${mockPhotoId}/edit$`));
  await expect(page.getByRole('button', { name: 'Story' })).toBeVisible({ timeout: 10000 });
});
