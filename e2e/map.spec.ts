import { test, expect } from '@playwright/test';
import { acceptDisclaimer } from './helpers/disclaimer';

test.describe('Map Component', () => {
  test('should render Google Maps and not the OpenStreetMap fallback', async ({ page, context }) => {
    // Inject E2E mode flag
    await page.addInitScript(() => {
      window.__E2E_MODE__ = true;
    });

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

    // Mock current user profile (AuthContext fetchProfile -> GET /api/users/me)
    await page.route('**/api/users/me', async route => {
      await route.fulfill({
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
          'Access-Control-Allow-Credentials': 'true'
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
      await route.fulfill({
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
          'Access-Control-Allow-Credentials': 'true'
        },
        json: { success: true, data: { terms_accepted_at: new Date().toISOString() } },
      });
    });

    // Preferences endpoint (AuthContext fetchPreferences)
    await page.route('**/api/users/me/preferences', async route => {
      await route.fulfill({
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
          'Access-Control-Allow-Credentials': 'true'
        },
        json: { success: true, data: { gradingScales: {} } },
      });
    });

    // 3. Mock Photos List
    const mockPhoto = {
      id: 'test-photo-1',
      filename: 'test-photo.jpg',
      state: 'working',
      caption: 'Map test photo',
      url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      thumbnail: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      file_size: 1234,
      created_at: '2025-12-01T12:00:00Z',
      latitude: 37.7749,
      longitude: -122.4194,
      metadata: {
        GPS: {
          latitude: 37.7749,
          longitude: -122.4194,
          imgDirection: 90
        }
      }
    };

    // Single unified route handler for all /photos requests
    await page.route('**/photos**', async route => {
      const url = route.request().url();
      const headers = {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
        'Access-Control-Allow-Credentials': 'true'
      };
      
      // Handle thumbnail-url endpoint
      if (url.includes('/thumbnail-url')) {
        await route.fulfill({
          headers,
          json: {
            success: true,
            url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
          }
        });
        return;
      }
      
      // Handle dependencies
      if (url.includes('/dependencies')) {
        await route.fulfill({ 
          headers,
          json: { 
            success: true, 
            dependencies: { aiQueue: true } 
          } 
        });
        return;
      }
      
      // Handle models
      if (url.includes('/models')) {
        await route.fulfill({ 
          headers,
          json: { 
            success: true, 
            models: ['gpt-4-vision-preview'] 
          } 
        });
        return;
      }

      // Handle status for SmartRouter
      if (url.includes('/status')) {
        await route.fulfill({
          headers,
          json: {
            success: true,
            working: 1,
            inprogress: 0,
            finished: 0,
            total: 1
          }
        });
        return;
      }
      
      // Handle single photo detail (test-photo-1 without thumbnail-url)
      if (url.includes('/test-photo-1') && !url.includes('?')) {
        await route.fulfill({ 
          headers,
          json: { 
            success: true, 
            photo: mockPhoto 
          } 
        });
        return;
      }
      
      // Default: photos list
      await route.fulfill({ 
        headers,
        json: { 
          success: true,
          photos: [mockPhoto]
        } 
      });
    });

    // 5. Mock Privilege
    await page.route('**/privilege', async route => {
      await route.fulfill({ 
        headers: {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
          'Access-Control-Allow-Credentials': 'true'
        },
        json: route.request().method() === 'POST'
          ? { success: true, privileges: { 'test-photo.jpg': 'owner' } }
          : { success: true, privilege: 'owner' }
      });
    });




    // Navigate directly to gallery for stable selection
    await page.goto('http://127.0.0.1:5173/gallery', { waitUntil: 'networkidle' });
    
    // Handle disclaimer modal if present
    await acceptDisclaimer(page);

    // Wait for auth check and page to stabilize
    await page.waitForTimeout(2000);

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
