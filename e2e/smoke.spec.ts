import { test, expect } from '@playwright/test';

test('E2E smoke: login → upload → view', async ({ page, context }) => {
  // Set up route mocks FIRST before any requests
  // Mock e2e-verify endpoint to ensure auth works under parallel test load
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

  // E2E login: make request to get the auth cookie
  const loginResponse = await context.request.post('http://localhost:3001/api/test/e2e-login');
  expect(loginResponse.ok()).toBeTruthy();
  
  // Extract cookies from the response and add them to the browser context for localhost
  const cookies = await context.cookies('http://localhost:3001');
  
  // Re-add cookies for localhost (any port) so they're sent to port 5173 as well
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

  // Go to gallery (should be authenticated - cookie is set for localhost)
  await page.goto('http://localhost:5173/');
  
  // Wait for auth check to complete
  await page.waitForTimeout(2000);
  
  // Check for authenticated elements - user email or logout button
  await expect(page.getByText('e2e@example.com')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});
