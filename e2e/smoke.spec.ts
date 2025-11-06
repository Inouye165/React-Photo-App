import { test, expect } from '@playwright/test';

test('E2E smoke: login → upload → view', async ({ page }) => {
  await page.goto('http://localhost:5173/login');
  // If login requires credentials, skip with TODO
  test.skip('TODO: needs test user or stub');
});
