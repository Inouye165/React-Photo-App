import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('A11y: upload page', async ({ page }) => {
  await page.goto('http://localhost:5173/upload');
  const { violations } = await new AxeBuilder({ page }).analyze();
  const severe = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(severe).toEqual([]);
});
