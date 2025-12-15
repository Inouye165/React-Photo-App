import { test, expect } from '@playwright/test';

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

  // Go to gallery (should be authenticated - cookie is set for localhost)
  await page.goto('http://127.0.0.1:5173/');
  
  // Wait for auth check to complete
  await page.waitForTimeout(2000);
  
  // Check for authenticated elements - user email (truncated) or logout button
  // The UI displays the part before @ (e.g. "e2e" from "e2e@example.com")
  await expect(page.getByText('e2e', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});
