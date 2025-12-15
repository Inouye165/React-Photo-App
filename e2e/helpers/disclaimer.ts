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

  // Check if the modal exists (short timeout to not slow down tests if not present)
  const modal = page.getByRole('dialog', { name: 'Experimental Feature Notice' });
  
  try {
    // Wait briefly to see if it appears
    await modal.waitFor({ state: 'visible', timeout: 2000 });
  } catch (e) {
    // Modal not present, continue
    return;
  }

  // If we get here, modal is visible
  console.log('Disclaimer modal detected, accepting...');

  // Check the "I have read and understood" checkbox
  const checkbox = page.getByRole('checkbox', { name: /I have read and understood/i });
  await checkbox.waitFor({ state: 'visible' });
  await checkbox.check();
  
  // Wait for state update
  await page.waitForTimeout(500);

  // Wait for button to be enabled
  // Use filter instead of name option in case of accessibility name issues
  const button = modal.getByRole('button').filter({ hasText: /Accept and Continue/i });
  await expect(button).toBeEnabled();
  
  // Click "Accept and Continue"
  await button.click();
  
  // Wait for modal to disappear
  await expect(modal).not.toBeVisible();
  console.log('Disclaimer accepted.');
}
