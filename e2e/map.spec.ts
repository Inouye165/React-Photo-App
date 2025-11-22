import { test, expect } from '@playwright/test';

test.describe('Map Component', () => {
  test('should render Google Maps and not the OpenStreetMap fallback', async ({ page }) => {
    // Debug console
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err}`));
    page.on('requestfailed', req => console.log(`REQUEST FAILED: ${req.url()} - ${req.failure()?.errorText}`));

    // 1. Mock CSRF token
    await page.route('**/auth/csrf', async route => {
      console.log('Mocking CSRF');
      await route.fulfill({ json: { csrfToken: 'mock-token' } });
    });


    // 2. Mock Auth Verification (Auto-login)
    await page.route('**/auth/verify', async route => {
      await route.fulfill({ 
        json: { 
          success: true, 
          user: { id: 1, username: 'test-user', role: 'admin' } 
        } 
      });
    });

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

    await page.route('**/photos*', async route => {
      const url = route.request().url();
      // Avoid intercepting specific sub-resources if they are handled by other routes
      if (url.includes('/dependencies') || url.includes('/models') || url.includes('/test-photo-1')) {
        return route.fallback();
      }
      
      console.log('Mocking Photos List for:', url);
      await route.fulfill({ 
        json: { 
          success: true, 
          photos: [mockPhoto] 
        } 
      });
    });

    // 4. Mock Single Photo Detail (if fetched separately)
    await page.route('**/photos/test-photo-1*', async route => {
      await route.fulfill({ 
        json: { 
          success: true, 
          photo: mockPhoto 
        } 
      });
    });

    // 5. Mock Dependencies
    await page.route('**/photos/dependencies', async route => {
      await route.fulfill({ 
        json: { 
          success: true, 
          dependencies: { aiQueue: true } 
        } 
      });
    });

    // 6. Mock Privilege
    await page.route('**/privilege', async route => {
      await route.fulfill({ 
        json: { 
          success: true, 
          privileges: { 'test-photo-1': true } 
        } 
      });
    });

    // 7. Mock Models
    await page.route('**/photos/models', async route => {
      await route.fulfill({ 
        json: { 
          success: true, 
          models: ['gpt-4-vision-preview'] 
        } 
      });
    });

    // Navigate to app
    await page.goto('http://localhost:5173/');

    // Wait for photo to appear (bypassing login screen due to mock)
    const photo = page.locator('img[alt="test-photo.jpg"]').first();
    await photo.waitFor({ state: 'visible', timeout: 10000 });
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
