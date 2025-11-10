import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('A11y: gallery page', async ({ page }) => {
  await page.goto('http://localhost:5173/gallery');
  const { violations } = await new AxeBuilder({ page }).analyze();
  // Allow moderate/minor for now; enforce no serious/critical
  const severe = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(severe).toEqual([]);
});
