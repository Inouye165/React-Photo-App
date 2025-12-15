import { Page, expect } from '@playwright/test';

/**
 * Helper to accept the experimental disclaimer modal if it appears.
 * This should be called after login or page load where the modal might block interaction.
 */
export async function acceptDisclaimer(page: Page) {
  // Add dialog listener to catch errors (e.g. API failure)
  page.on('dialog', async dialog => {
    console.log(`[Disclaimer] Dialog appeared: ${dialog.message()}`);
    await dialog.dismiss();
  });

  // Check if a disclaimer modal exists (short timeout to not slow down tests if not present)
  // The modal title/copy can change over time (e.g., branded "Lumina" header), so avoid
  // hard-coding a single accessible name.
  const modal = page.getByRole('dialog');
  
  try {
    // Wait briefly to see if it appears
    await modal.waitFor({ state: 'visible', timeout: 2000 });
  } catch (e) {
    // Modal not present, continue
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
  await expect(modal).not.toBeVisible();
  console.log('Disclaimer accepted.');
}
