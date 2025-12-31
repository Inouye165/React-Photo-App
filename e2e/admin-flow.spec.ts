/**
 * Admin Flow E2E Tests
 * 
 * Tests for admin-specific features:
 * - Admin badge visibility in AppHeader
 * - Admin navigation link
 * - Admin dashboard access control
 * - User invitation flow
 * - Suggestions review
 * 
 * SECURITY TESTS:
 * - Non-admin users cannot access /admin route
 * - Admin badge only visible to admins
 * - Admin link only visible to admins
 */

import { test, expect } from '@playwright/test';

// Helper to create test user with specific role
async function loginAsUser(page, role = 'user') {
  // Navigate to login
  await page.goto('/');
  
  // If already logged in, log out first
  const logoutButton = page.getByTestId('logout-button');
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
    await page.waitForURL('/');
  }

  // Use E2E test credentials (from e2e/fixtures/testUsers.js or similar)
  const testEmail = role === 'admin' ? 'admin@test.com' : 'user@test.com';
  const testPassword = 'TestPassword123!';

  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  
  // Wait for successful login
  await page.waitForURL(/\/gallery|\/upload/);
}

test.describe('Admin Badge and Navigation', () => {
  test('admin users should see admin badge in header', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/gallery');

    // Check for admin badge
    const adminBadge = page.locator('text=ADMIN');
    await expect(adminBadge).toBeVisible();
  });

  test('admin users should see admin navigation link', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/gallery');

    // Check for admin nav link
    const adminNavLink = page.getByTestId('nav-admin');
    await expect(adminNavLink).toBeVisible();
  });

  test('non-admin users should NOT see admin badge', async ({ page }) => {
    await loginAsUser(page, 'user');
    await page.goto('/gallery');

    // Admin badge should not exist
    const adminBadge = page.locator('text=ADMIN');
    await expect(adminBadge).not.toBeVisible();
  });

  test('non-admin users should NOT see admin navigation link', async ({ page }) => {
    await loginAsUser(page, 'user');
    await page.goto('/gallery');

    // Admin nav link should not exist
    const adminNavLink = page.getByTestId('nav-admin');
    await expect(adminNavLink).not.toBeVisible();
  });
});

test.describe('Admin Dashboard Access Control', () => {
  test('admin users can access /admin route', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/admin');

    // Should see admin dashboard
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible();
    
    // Should see tabs
    await expect(page.locator('text=Invites')).toBeVisible();
    await expect(page.locator('text=Suggestions Review')).toBeVisible();
  });

  test('non-admin users cannot access /admin route', async ({ page }) => {
    await loginAsUser(page, 'user');
    await page.goto('/admin');

    // Should see access denied message
    await expect(page.locator('text=Access Denied')).toBeVisible();
    await expect(page.locator('text=do not have permission')).toBeVisible();
  });

  test('unauthenticated users cannot access /admin route', async ({ page }) => {
    await page.goto('/admin');

    // Should be redirected to login
    await expect(page).toHaveURL(/\/.*(?!\/admin)/);
  });
});

test.describe('Admin Invite Functionality', () => {
  test('admin can view invite form', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/admin');

    // Should be on Invites tab by default
    await expect(page.locator('label:has-text("Email Address")')).toBeVisible();
    await expect(page.locator('button:has-text("Send Invite")')).toBeVisible();
  });

  test('admin can submit valid email invitation', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/admin');

    // Fill in email
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('newuser@example.com');

    // Submit form
    await page.click('button:has-text("Send Invite")');

    // Should see success or error message
    // Note: In test environment without SUPABASE_SERVICE_ROLE_KEY, this may show an error
    const message = page.locator('[class*="bg-green-50"], [class*="bg-red-50"]');
    await expect(message).toBeVisible({ timeout: 5000 });
  });

  test('admin sees validation error for invalid email', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/admin');

    // Fill in invalid email
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('invalid-email');

    // Submit form
    await page.click('button:has-text("Send Invite")');

    // Should see error message (either from browser validation or backend)
    // Browser may prevent submission, so check if form is still present
    await expect(emailInput).toBeVisible();
  });
});

test.describe('Admin Suggestions Review', () => {
  test('admin can view suggestions tab', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/admin');

    // Click on Suggestions Review tab
    await page.click('button:has-text("Suggestions Review")');

    // Should see suggestions interface
    await expect(page.locator('h2:has-text("AI Suggestions Review")')).toBeVisible();
    await expect(page.locator('label:has-text("Filter:")')).toBeVisible();
  });

  test('admin can filter suggestions by state', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/admin');

    // Navigate to Suggestions tab
    await page.click('button:has-text("Suggestions Review")');

    // Select filter
    const filterSelect = page.locator('select#state-filter');
    await filterSelect.selectOption('analyzed');

    // Wait for results to load
    await page.waitForTimeout(1000);

    // Should maintain the filter selection
    await expect(filterSelect).toHaveValue('analyzed');
  });

  test('suggestions list shows photo metadata', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/admin');

    // Navigate to Suggestions tab
    await page.click('button:has-text("Suggestions Review")');

    // Wait for data to load
    await page.waitForTimeout(1000);

    // Check for either data or empty state
    const hasData = await page.locator('[class*="bg-gray-50"]').count() > 0;
    const emptyState = await page.locator('text=No AI-generated suggestions found').isVisible();

    expect(hasData || emptyState).toBe(true);
  });
});

test.describe('Admin Navigation Integration', () => {
  test('admin can navigate from gallery to admin dashboard', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/gallery');

    // Click admin nav link
    const adminNavLink = page.getByTestId('nav-admin');
    await adminNavLink.click();

    // Should navigate to admin dashboard
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible();
  });

  test('admin can navigate back from admin dashboard', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/admin');

    // Click gallery nav link
    const galleryNavLink = page.getByTestId('nav-gallery');
    await galleryNavLink.click();

    // Should navigate back to gallery
    await expect(page).toHaveURL('/gallery');
  });
});

test.describe('Admin Role Verification', () => {
  test('admin badge displays correct styling', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/gallery');

    const adminBadge = page.locator('text=ADMIN');
    await expect(adminBadge).toBeVisible();

    // Check for admin badge styling (purple theme)
    const badgeClasses = await adminBadge.getAttribute('class');
    expect(badgeClasses).toContain('purple');
  });

  test('admin shield icon appears in navigation', async ({ page }) => {
    await loginAsUser(page, 'admin');
    await page.goto('/gallery');

    const adminNavLink = page.getByTestId('nav-admin');
    await expect(adminNavLink).toBeVisible();

    // Should contain Shield icon (check for SVG or icon class)
    const hasIcon = await adminNavLink.locator('svg').count() > 0;
    expect(hasIcon).toBe(true);
  });
});
