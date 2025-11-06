import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('A11y: upload page', async ({ page }) => {
  await page.goto('http://localhost:5173/upload');
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
