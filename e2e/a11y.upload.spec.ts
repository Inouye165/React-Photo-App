import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { acceptDisclaimer } from './helpers/disclaimer';
import { mockCoreApi } from './helpers/mockCoreApi';

test('A11y: upload page', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __E2E_MODE__?: boolean }).__E2E_MODE__ = true;
  });

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

  await page.route('**/api/users/me/preferences', async route => {
    await route.fulfill({
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
        'Access-Control-Allow-Credentials': 'true'
      },
      json: {
        success: true,
        data: {
          map_mode_enabled: false,
          compare_mode_enabled: false,
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

  await page.goto('http://127.0.0.1:5173/');

  await page.evaluate(() => {
    window.history.pushState({}, '', '/upload');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/upload$/);
  
  // Handle disclaimer modal if present
  await acceptDisclaimer(page);

  await page.waitForTimeout(2000); // Wait for auth check
  await expect(page.getByRole('heading', { name: /Upload Your Photos/i })).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .include('[aria-label^="Upload photos"]')
    .analyze();
  const severe = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(severe).toEqual([]);
});
