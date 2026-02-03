import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { acceptDisclaimer } from './helpers/disclaimer';
import { fetchCsrfToken } from './helpers/csrf';
import { mockCoreApi } from './helpers/mockCoreApi';

test('A11y: gallery page', async ({ page, context }) => {
  await mockCoreApi(page);
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

  await page.route('**/api/users/accept-terms', async route => {
    await route.fulfill({
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
        'Access-Control-Allow-Credentials': 'true'
      },
      json: { success: true, data: { terms_accepted_at: new Date().toISOString() } },
    });
  });

  // E2E login: make request to get the auth cookie
  const csrfToken = await fetchCsrfToken(context.request);
  const loginResponse = await context.request.post('http://127.0.0.1:3001/api/test/e2e-login', {
    headers: { 'X-CSRF-Token': csrfToken },
  });
  expect(loginResponse.ok()).toBeTruthy();
  
  // Extract cookies and add them for localhost
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

  await page.goto('http://127.0.0.1:5173/gallery');
  
  // Handle disclaimer modal if present
  await acceptDisclaimer(page);

  await page.waitForTimeout(2000); // Wait for auth check
  const { violations } = await new AxeBuilder({ page }).analyze();
  // Allow moderate/minor for now; enforce no serious/critical
  const severe = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(severe).toEqual([]);
});
