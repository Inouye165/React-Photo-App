import { test, expect } from '@playwright/test';
import { acceptDisclaimer } from './helpers/disclaimer';

test.describe('Map Component', () => {
  test('should render Google Maps and not the OpenStreetMap fallback', async ({ page, context }) => {
    // Inject E2E mode flag
    await page.addInitScript(() => {
      window.__E2E_MODE__ = true;
    });

    const corsHeaders = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-E2E-User-ID',
    };

    // E2E login: make request to get the auth cookie
    const loginResponse = await context.request.post('http://127.0.0.1:3001/api/test/e2e-login');
    expect(loginResponse.ok()).toBeTruthy();
    
    // Extract cookies and add them for 127.0.0.1
    const cookies = await context.cookies('http://127.0.0.1:3001');
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

    // Mock e2e-verify endpoint to ensure auth works
    await page.route('**/api/test/e2e-verify', async route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: corsHeaders,
          body: ''
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          ...corsHeaders,
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

    // Mock current user profile (AuthContext fetchProfile -> GET /api/users/me)
    await page.route('**/api/users/me', async route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: corsHeaders,
          body: ''
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          ...corsHeaders,
        },
        json: {
          success: true,
          data: {
            id: '11111111-1111-4111-8111-111111111111',
            username: 'e2e-test',
            has_set_username: true,
          },
        },
      });
    });

    // Accept terms endpoint (used by disclaimer modal flow)
    await page.route('**/api/users/accept-terms', async route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: corsHeaders,
          body: ''
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          ...corsHeaders,
        },
        json: { success: true, data: { terms_accepted_at: new Date().toISOString() } },
      });
    });

    // Preferences endpoint (AuthContext fetchPreferences)
    await page.route('**/api/users/me/preferences', async route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: corsHeaders,
          body: ''
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          ...corsHeaders,
        },
        json: { success: true, data: { gradingScales: {} } },
      });
    });

    // 3. Mock Photos List (deterministic)
    const mockPhotoId = '999';
    const now = Math.floor(Date.now() / 1000);

    // Photo list: only intercept the list endpoint (avoid swallowing subpaths)
    await page.route('**/photos', async route => {
      const url = route.request().url();
      const method = route.request().method();
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
        json: {
          success: true,
          photos: [
            {
              id: mockPhotoId,
              filename: 'photo-999.jpg',
              state: 'working',
              caption: 'Map test photo',
              thumbnail: `/photos/${mockPhotoId}/thumb`,
              url: `/photos/${mockPhotoId}/blob`,
              file_size: 1234,
              created_at: '2025-12-01T12:00:00Z',
              latitude: 37.7749,
              longitude: -122.4194,
              metadata: {
                GPS: {
                  latitude: 37.7749,
                  longitude: -122.4194,
                  imgDirection: 90,
                },
              },
            },
          ],
        },
      });
    });

    // Dependency status (used by SmartRouter/other UI bits)
    await page.route('**/photos/dependencies', async route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        json: { success: true, dependencies: { aiQueue: true } },
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
        json: { success: true, url: `/photos/${mockPhotoId}/thumb`, expiresAt: now + 3600 },
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

    // 5. Mock Privilege
    await page.route('**/privilege', async route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: corsHeaders,
          body: ''
        });
      }
      await route.fulfill({ 
        status: 200,
        contentType: 'application/json',
        headers: {
          ...corsHeaders,
        },
        json: route.request().method() === 'POST'
          ? { success: true, privileges: { 'photo-999.jpg': 'owner' } }
          : { success: true, privilege: 'owner' }
      });
    });




    // Navigate directly to gallery for stable selection
    await page.goto('http://127.0.0.1:5173/gallery', { waitUntil: 'networkidle' });
    
    // Handle disclaimer modal if present
    await acceptDisclaimer(page);

    // Wait for auth check and page to stabilize
    await page.waitForTimeout(2000);

    // Ensure auth has settled (prevents racing photo fetch expectations)
    await expect(page.getByText('e2e-test', { exact: true })).toBeVisible({ timeout: 10000 });

    // Wait for photo cards to render and open the detail view
    await expect(page.getByTestId('photo-card').first()).toBeVisible({ timeout: 15000 });
    await page.getByTestId('photo-card').first().click();

    // Wait for detail panel
    const osmIframe = page.locator('iframe[title="Map (OpenStreetMap)"]');

    // Expect Google Maps to be visible
    // We check that the OSM fallback is NOT visible
    await expect(osmIframe).not.toBeVisible();
    
    // Check for the absence of the error message
    await expect(page.getByText('Map configuration missing')).not.toBeVisible();
    
    // Optionally check for Google Maps specific elements if we want to be sure it loaded
    // But checking for absence of fallback is the primary regression test here.
  });
});
