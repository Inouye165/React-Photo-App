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

  // Analysis tab is accessible in the tab bar
  await expect(page.getByRole('tab', { name: 'Analysis' })).toBeVisible()

  const boardBox = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boardBox).not.toBeNull()
  expect(boardBox!.width).toBeGreaterThanOrEqual(520)
  expect(boardBox!.height).toBeGreaterThanOrEqual(520)

  await expectNoPageVerticalScroll(page)
})

test('desktop Analysis tab shows analysis list and switches correctly', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  // Switch to Analysis tab
  await page.getByRole('tab', { name: 'Analysis' }).click()
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('gotw-analysis-list')).toBeVisible()

  // Can switch back to Moves
  await page.getByRole('tab', { name: 'Moves' }).click()
  await expect(page.getByRole('tab', { name: 'Moves' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('gotw-moves-list')).toBeVisible()

  await expectNoPageVerticalScroll(page)
})

test('move quality badge shows for annotated ply', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  // Set slider to ply 34 (the queen sacrifice — classified as brilliant, symbol '!!')
  await page.locator('#gotw-replay-slider').fill('34')

  await expect(page.getByTestId('gotw-move-quality-badge')).toBeVisible()
  await expect(page.getByTestId('gotw-move-quality-badge')).toContainText('!!')

  // Still no page scroll
  await expectNoPageVerticalScroll(page)
})

test('move quality badge shows blunder for ply 33', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  // Set slider to ply 33 (Kf1 blunder — symbol '??')
  await page.locator('#gotw-replay-slider').fill('33')

  await expect(page.getByTestId('gotw-move-quality-badge')).toBeVisible()
  await expect(page.getByTestId('gotw-move-quality-badge')).toContainText('??')
})

test('chapters rail and guided toggle are visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  await expect(page.getByTestId('gotw-chapters-rail')).toBeVisible()

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

  // Analysis tab is available in mobile bottom sheet
  const mobileTabs = page.getByTestId('gotw-mobile-sheet').getByRole('tab', { name: 'Analysis' })
  await expect(mobileTabs).toBeVisible()
})

test('board size stays stable when switching between annotated and non-annotated plies', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  // Jump to a non-annotated ply and capture the board bounding box
  await page.locator('#gotw-replay-slider').fill('10')
  await page.waitForTimeout(300)
  const boxBefore = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boxBefore).not.toBeNull()

  // Jump to an annotated chapter ply (ply 46 — analysis + coach prompt)
  await page.locator('#gotw-replay-slider').fill('46')
  await page.waitForTimeout(300)
  const boxAfterAnnotated = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boxAfterAnnotated).not.toBeNull()

  // Board dimensions must not change (1px tolerance for sub-pixel rounding)
  expect(Math.abs(boxBefore!.width - boxAfterAnnotated!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(boxBefore!.height - boxAfterAnnotated!.height)).toBeLessThanOrEqual(1)

  // Jump back to a non-annotated ply — board still stable
  await page.locator('#gotw-replay-slider').fill('5')
  await page.waitForTimeout(300)
  const boxAfterReturn = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boxAfterReturn).not.toBeNull()
  expect(Math.abs(boxBefore!.width - boxAfterReturn!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(boxBefore!.height - boxAfterReturn!.height)).toBeLessThanOrEqual(1)

  await expectNoPageVerticalScroll(page)
})

test('insight panel is visible on desktop with stable layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  // Jump to an annotated ply to populate the panel
  await page.locator('#gotw-replay-slider').fill('34')
  await page.waitForTimeout(300)

  await expect(page.getByTestId('gotw-insight-panel')).toBeVisible()
  await expect(page.getByTestId('gotw-move-quality-badge')).toBeVisible()

  await expectNoPageVerticalScroll(page)
})

test('board insight popup appears at annotated ply and can be dismissed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  // Pause autoplay so we control ply manually
  await page.getByRole('button', { name: 'Pause replay' }).click()

  // Jump to ply 34 (queen sacrifice — brilliant)
  await page.locator('#gotw-replay-slider').fill('34')
  await page.waitForTimeout(300)

  await expect(page.getByTestId('gotw-board-insight-popup')).toBeVisible()

  // Board size unchanged with popup present
  const boardBox = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boardBox).not.toBeNull()
  expect(boardBox!.width).toBeGreaterThanOrEqual(520)

  // Popup sits outside the board's playable area (above or below)
  const popupBox = await page.getByTestId('gotw-board-insight-popup').boundingBox()
  expect(popupBox).not.toBeNull()
  const popupAbove = popupBox!.y + popupBox!.height <= boardBox!.y + 2
  const popupBelow = popupBox!.y >= boardBox!.y + boardBox!.height - 2
  expect(popupAbove || popupBelow).toBe(true)

  // Click board wrapper area to dismiss popup
  const boardFrame = page.getByTestId('gotw-board-frame')
  await boardFrame.click({ position: { x: 10, y: 10 } })
  await expect(page.getByTestId('gotw-board-insight-popup')).not.toBeVisible()

  await expectNoPageVerticalScroll(page)
})

test('board size remains stable when popup is shown vs hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupAuthenticatedSession(page)

  await page.goto(GOTW_URL, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Pause replay' }).click()

  // Capture at non-annotated ply (no popup)
  await page.locator('#gotw-replay-slider').fill('10')
  await page.waitForTimeout(300)
  const boxNoPopup = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boxNoPopup).not.toBeNull()

  // Jump to annotated ply (popup visible)
  await page.locator('#gotw-replay-slider').fill('34')
  await page.waitForTimeout(300)
  await expect(page.getByTestId('gotw-board-insight-popup')).toBeVisible()
  const boxWithPopup = await page.getByTestId('gotw-full-board').boundingBox()
  expect(boxWithPopup).not.toBeNull()

  expect(Math.abs(boxNoPopup!.width - boxWithPopup!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(boxNoPopup!.height - boxWithPopup!.height)).toBeLessThanOrEqual(1)

  await expectNoPageVerticalScroll(page)
})
