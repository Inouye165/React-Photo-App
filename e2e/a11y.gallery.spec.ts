import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('A11y: gallery page', async ({ page, context }) => {
  // Set up route mocks FIRST before any requests
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

  await page.goto('http://localhost:5173/gallery');
  await page.waitForTimeout(2000); // Wait for auth check
  const { violations } = await new AxeBuilder({ page }).analyze();
  // Allow moderate/minor for now; enforce no serious/critical
  const severe = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(severe).toEqual([]);
});
