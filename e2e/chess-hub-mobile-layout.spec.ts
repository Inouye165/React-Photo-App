import { test, expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { acceptDisclaimer } from './helpers/disclaimer'
import { mockCoreApi } from './helpers/mockCoreApi'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, prefer',
}

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111'
const TEST_GAME_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OPPONENT_ID = '22222222-2222-4222-8222-222222222222'

function sixDaysAgoIso(): string {
  return new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)).toISOString()
}

async function setupChessHubMobilePage(page: Page): Promise<void> {
  await mockCoreApi(page)

  await page.addInitScript(({ userId }) => {
    ;(window as Window & { __E2E_MODE__?: boolean }).__E2E_MODE__ = true

    const sessionPayload = {
      access_token: 'e2e-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'e2e-refresh-token',
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'e2e@example.com',
      },
    }

    const value = JSON.stringify(sessionPayload)
    window.localStorage.setItem('supabase.auth.token', value)
    window.localStorage.setItem('sb-127.0.0.1-auth-token', value)
    window.localStorage.setItem('sb-localhost-auth-token', value)
  }, { userId: TEST_USER_ID })

  await page.route('**/api/test/e2e-verify', async (route: Route) => {
    await route.fulfill({
      headers: CORS_HEADERS,
      json: {
        success: true,
        user: {
          id: TEST_USER_ID,
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
          id: TEST_USER_ID,
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

  await page.route('**/auth/v1/**', async (route: Route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    const url = route.request().url()
    if (url.includes('/settings')) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS_HEADERS, body: JSON.stringify({ external: {}, disable_signup: false }) })
    }

    if (url.includes('/user')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({
          id: TEST_USER_ID,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'e2e@example.com',
        }),
      })
    }

    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS_HEADERS, body: JSON.stringify({}) })
  })

  await page.route('**/rest/v1/game_members**', async (route: Route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    if (method !== 'GET') {
      return route.fulfill({ status: 405, headers: CORS_HEADERS, body: '' })
    }

    const url = new URL(route.request().url())
    const select = url.searchParams.get('select') || ''

    if (select.includes('game:games(')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify([
          {
            game_id: TEST_GAME_ID,
            game: {
              id: TEST_GAME_ID,
              type: 'chess',
              status: 'active',
              created_by: TEST_USER_ID,
              created_at: sixDaysAgoIso(),
              updated_at: sixDaysAgoIso(),
              time_control: { mode: 'none' },
              current_fen: 'startpos',
              current_turn: 'w',
              result: null,
            },
          },
        ]),
      })
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify([
        { game_id: TEST_GAME_ID, role: 'white', user_id: TEST_USER_ID },
        { game_id: TEST_GAME_ID, role: 'black', user_id: OPPONENT_ID },
      ]),
    })
  })

  await page.route('**/rest/v1/users**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 405, headers: CORS_HEADERS, body: '' })
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify([
        { id: TEST_USER_ID, username: 'e2e-test' },
        { id: OPPONENT_ID, username: 'Alice' },
      ]),
    })
  })

  await page.goto('http://127.0.0.1:5173/games/chess', { waitUntil: 'networkidle' })
  await acceptDisclaimer(page)

  await page.evaluate(async ({ userId }) => {
    const module = await import('/src/supabaseClient.ts')
    const client = module.supabase as { auth: { getUser: () => Promise<unknown> } }
    client.auth.getUser = async () => ({
      data: {
        user: {
          id: userId,
          email: 'e2e@example.com',
        },
      },
      error: null,
    })
  }, { userId: TEST_USER_ID })

  const retryButton = page.getByRole('button', { name: 'Try Again' })
  if (await retryButton.isVisible()) {
    await retryButton.click()
  }
}

test('mobile chess hub keeps dense resume card and responsive mode thumbs without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setupChessHubMobilePage(page)

  const continueGameButton = page.getByRole('button', { name: 'Continue Game' })
  await expect(continueGameButton).toBeVisible()

  const horizontalOverflow = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    return {
      docOverflow: doc.scrollWidth > doc.clientWidth,
      bodyOverflow: body.scrollWidth > body.clientWidth,
    }
  })

  expect(horizontalOverflow.docOverflow).toBe(false)
  expect(horizontalOverflow.bodyOverflow).toBe(false)

  const resumeCardMetrics = await page.getByTestId('chess-mobile-resume-card').evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return {
      cardHeight: rect.height,
      viewportHeight: window.innerHeight,
    }
  })

  expect(resumeCardMetrics.cardHeight).toBeLessThan(resumeCardMetrics.viewportHeight * 0.35)

  const thumbs = page.getByTestId('chess-mobile-mode-thumb')
  await expect(thumbs.first()).toBeVisible()

  const thumbsMeetMinSize = await thumbs.evaluateAll((nodes) => nodes.every((node) => {
    const style = window.getComputedStyle(node)
    const width = Number.parseFloat(style.width)
    const height = Number.parseFloat(style.height)
    return width >= 48 && height >= 48
  }))

  expect(thumbsMeetMinSize).toBe(true)
})
