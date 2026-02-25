import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { acceptDisclaimer } from './helpers/disclaimer'
import { mockCoreApi } from './helpers/mockCoreApi'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function setupChessHubPage(page: Page): Promise<void> {
  await mockCoreApi(page)

  await page.addInitScript(() => {
    ;(window as Window & { __E2E_MODE__?: boolean }).__E2E_MODE__ = true
  })

  await page.route('**/api/test/e2e-verify', async route => {
    await route.fulfill({
      headers: CORS_HEADERS,
      json: {
        success: true,
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          username: 'e2e-test',
          role: 'admin',
          email: 'e2e@example.com',
        },
      },
    })
  })

  await page.route('**/api/users/me', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          username: 'e2e-test',
          has_set_username: true,
        },
      }),
    })
  })

  await page.route('**/api/users/me/preferences', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, preferences: {} }),
    })
  })

  await page.route('**/api/users/accept-terms', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, data: { terms_accepted_at: new Date().toISOString() } }),
    })
  })

  await page.goto('http://127.0.0.1:5173/games/chess', { waitUntil: 'networkidle' })
  await acceptDisclaimer(page)
}

test('hub is one-screen desktop, removes old sections, and keeps GOTW board in one card', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupChessHubPage(page)

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport)
    await page.goto('http://127.0.0.1:5173/games/chess', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('gotw-card')).toBeVisible()
    await expect(page.getByTestId('mode-card')).toHaveCount(3)
    await expect(page.getByTestId('gotw-watch-cta')).toBeVisible()
    await expect(page.getByTestId('gotw-preview-board')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Choose a mode' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Continue' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Recent' })).toHaveCount(0)

    const gotwContainsBoard = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="gotw-card"]')
      const board = document.querySelector('[data-testid="gotw-preview-board"]')
      return Boolean(card && board && card.contains(board))
    })
    expect(gotwContainsBoard).toBe(true)

    const scrollMetrics = await page.evaluate(() => {
      const doc = document.documentElement
      const body = document.body
      return {
        docScrollHeight: doc.scrollHeight,
        docClientHeight: doc.clientHeight,
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
      }
    })

    expect(scrollMetrics.docScrollHeight).toBeLessThanOrEqual(scrollMetrics.docClientHeight + 1)
    expect(scrollMetrics.bodyScrollHeight).toBeLessThanOrEqual(scrollMetrics.bodyClientHeight + 1)
  }
})

test('full replay route shows board and ESC/back returns to hub', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupChessHubPage(page)

  await page.getByTestId('gotw-watch-cta').click()

  await expect(page.getByTestId('gotw-full-root')).toBeVisible()
  await expect(page.getByTestId('gotw-full-board')).toBeVisible()
  await expect(page.getByTestId('gotw-player-black')).toBeVisible()
  await expect(page.getByTestId('gotw-player-white')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/games\/chess$/)

  await page.getByTestId('gotw-watch-cta').click()
  await page.getByRole('button', { name: 'Back to Chess Hub' }).click()
  await expect(page).toHaveURL(/\/games\/chess$/)
})

test('prefers-reduced-motion disables preview autoplay', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupChessHubPage(page)

  const initialText = await page.getByTestId('gotw-preview-ply').textContent()
  await page.waitForTimeout(1800)
  const nextText = await page.getByTestId('gotw-preview-ply').textContent()

  expect(nextText).toBe(initialText)
})
