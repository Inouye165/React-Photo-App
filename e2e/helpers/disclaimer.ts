import { Page, expect } from '@playwright/test';

/**
 * Helper to accept the experimental disclaimer modal if it appears.
 * This should be called after login or page load where the modal might block interaction.
 */
export async function acceptDisclaimer(page: Page) {
  // Pre-seed localStorage to bypass the modal when possible (matches AuthWrapper logic).
  const seedLocalStorage = () => {
    try {
      const ids = ['e2e-admin-user', 'e2e-normal-user', '11111111-1111-4111-8111-111111111111']
      ids.forEach((id) => {
        window.localStorage.setItem(`terms_accepted_${id}`, 'true')
      })
    } catch {
      // ignore
    }
  }

  await page.addInitScript(seedLocalStorage)
  try {
    await page.evaluate(seedLocalStorage)
  } catch {
    // ignore
  }

  // Add dialog listener to catch errors (e.g. API failure)
  page.on('dialog', async dialog => {
    console.log(`[Disclaimer] Dialog appeared: ${dialog.message()}`);
    await dialog.dismiss();
  });

  // Check if a disclaimer modal exists (wait for either modal or app shell).
  // The modal title/copy can change over time (e.g., branded "Lumina" header), so avoid
  // hard-coding a single accessible name.
  const modal = page.getByRole('dialog');
  const appReady = page.getByTestId('user-menu-trigger');

  try {
    await Promise.race([
      modal.waitFor({ state: 'visible', timeout: 5000 }),
      appReady.waitFor({ state: 'visible', timeout: 5000 }),
    ]);
  } catch {
    return;
  }

  if (!(await modal.isVisible().catch(() => false))) {
    return;
  }

  // If we get here, modal is visible
  console.log('Disclaimer modal detected, accepting...');

  // Check the acknowledgment checkbox (copy varies slightly across revisions)
  const checkboxByName = modal.getByRole('checkbox', { name: /I have read and understood/i });
  const checkbox = (await checkboxByName.count()) > 0 ? checkboxByName.first() : modal.getByRole('checkbox').first();
  await checkbox.waitFor({ state: 'visible' });
  await checkbox.check();
  
  // Wait for state update
  await page.waitForTimeout(500);

  // Wait for accept button to be enabled (label varies across revisions)
  const button = modal
    .getByRole('button')
    .filter({ hasText: /I Understand\s*&\s*Accept|Accept and Continue/i });
  await expect(button).toBeEnabled();
  
  // Click accept
  await button.click();
  
  // Wait for modal to disappear
  try {
    await expect(modal).not.toBeVisible();
    console.log('Disclaimer accepted.');
  } catch {
    // Force localStorage fallback and reload once if the modal is stubborn.
    await page.evaluate(() => {
      const ids = ['e2e-admin-user', 'e2e-normal-user', '11111111-1111-4111-8111-111111111111']
      ids.forEach((id) => {
        window.localStorage.setItem(`terms_accepted_${id}`, 'true')
      })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
}
