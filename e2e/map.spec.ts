import { test, expect } from '@playwright/test';

test.describe('Map Component', () => {
  test('should render Google Maps and not the OpenStreetMap fallback', async ({ page, context }) => {
    // E2E login: make request to get the auth cookie
    const loginResponse = await context.request.post('http://localhost:3001/api/test/e2e-login');
    expect(loginResponse.ok()).toBeTruthy();
    
    // Extract cookies and add them for localhost
    const cookies = await context.cookies('http://localhost:3001');
    for (const cookie of cookies) {
      await context.addCookies([{
        name: cookie.name,
        value: cookie.value,
        domain: 'localhost',
        path: '/',
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite
      }]);
    }

    // 3. Mock Photos List
    const mockPhoto = {
      id: 'test-photo-1',
      filename: 'test-photo.jpg',
      url: 'https://via.placeholder.com/150',
      thumbnail: 'https://via.placeholder.com/150',
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
      
      // Handle thumbnail-url endpoint
      if (url.includes('/thumbnail-url')) {
        await route.fulfill({
          json: {
            success: true,
            url: 'https://via.placeholder.com/150'
          }
        });
        return;
      }
      
      // Handle dependencies
      if (url.includes('/dependencies')) {
        await route.fulfill({ 
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
          json: { 
            success: true, 
            models: ['gpt-4-vision-preview'] 
          } 
        });
        return;
      }
      
      // Handle single photo detail (test-photo-1 without thumbnail-url)
      if (url.includes('/test-photo-1') && !url.includes('?')) {
        await route.fulfill({ 
          json: { 
            success: true, 
            photo: mockPhoto 
          } 
        });
        return;
      }
      
      // Default: photos list
      await route.fulfill({ 
        json: { 
          success: true, 
          photos: [mockPhoto] 
        } 
      });
    });

    // 5. Mock Privilege
    await page.route('**/privilege', async route => {
      await route.fulfill({ 
        json: { 
          success: true, 
          privileges: { 'test-photo-1': true } 
        } 
      });
    });

    // 6. Mock e2e-verify endpoint (ensure auth works even under load)
    await page.route('**/api/test/e2e-verify', async route => {
      await route.fulfill({
        json: {
          success: true,
          user: {
            id: 'e2e-test-user',
            username: 'e2e-test',
            role: 'admin',
            email: 'e2e@example.com'
          }
        }
      });
    });


    // Navigate to app (session cookie is set)
    await page.goto('http://localhost:5173/');
    
    // Wait for auth check and page to stabilize
    await page.waitForTimeout(2000);

    // Wait for photo to appear (bypassing login screen due to mock)
    const photo = page.locator('img[alt="test-photo.jpg"]').first();
    await photo.waitFor({ state: 'visible', timeout: 15000 });
    await photo.click();

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
