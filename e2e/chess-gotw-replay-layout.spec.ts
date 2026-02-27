import { test, expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { acceptDisclaimer } from './helpers/disclaimer'
import { mockCoreApi } from './helpers/mockCoreApi'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const GOTW_URL = 'http://127.0.0.1:5173/games/chess/gotw/byrne-vs-fischer-1956'

async function setupAuthenticatedSession(page: Page): Promise<void> {
  await mockCoreApi(page)

  await page.addInitScript(() => {
    ;(window as Window & { __E2E_MODE__?: boolean }).__E2E_MODE__ = true
  })

  await page.route('**/api/test/e2e-verify', async (route: Route) => {
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

  await page.route('**/api/users/me', async (route: Route) => {
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

  await page.route('**/api/users/me/preferences', async (route: Route) => {
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

  await page.route('**/api/users/accept-terms', async (route: Route) => {
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

async function expectNoPageVerticalScroll(page: Page): Promise<void> {
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

test('desktop GOTW replay keeps page fixed-height and large board with accessible moves panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  await expect(page.getByTestId('gotw-full-root')).toBeVisible()
  await expect(page.getByTestId('gotw-full-board')).toBeVisible()
  await expect(page.getByTestId('gotw-side-panel')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Moves' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('gotw-moves-list')).toBeVisible()

  const boardBox = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boardBox).not.toBeNull()
  expect(boardBox!.width).toBeGreaterThanOrEqual(520)
  expect(boardBox!.height).toBeGreaterThanOrEqual(520)

  await expectNoPageVerticalScroll(page)
})

test('mobile GOTW replay keeps page fixed-height and opens details bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  await expect(page.getByTestId('gotw-full-root')).toBeVisible()
  await expect(page.getByTestId('gotw-full-board')).toBeVisible()

  const boardBox = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boardBox).not.toBeNull()
  expect(boardBox!.width).toBeGreaterThanOrEqual(320)
  expect(boardBox!.height).toBeGreaterThanOrEqual(320)

  await expectNoPageVerticalScroll(page)

  await page.getByRole('button', { name: 'Open details panel' }).click()
  await expect(page.getByTestId('gotw-mobile-sheet')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Moves' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('gotw-moves-list').last()).toBeVisible()
})
