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

type ChessMobileScenario = {
  name: string
  activeMatch: 'short' | 'longMissingFields' | 'none'
  gotwState: 'ready' | 'missing' | 'error'
  expectedHeroCta: 'Continue game' | 'Play Computer'
  expectedHeroEnabled: boolean
}

function sixDaysAgoIso(): string {
  return new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)).toISOString()
}

async function setupChessHubMobilePage(page: Page, scenario: ChessMobileScenario): Promise<void> {
  await mockCoreApi(page)

  const heroState = scenario.activeMatch === 'none' ? 'empty' : 'active'
  const heroOpponent = scenario.activeMatch === 'longMissingFields'
    ? 'Grandmaster-Opponent-Name-With-Extra-Long-Text-For-Robustness-Checks'
    : 'Alice'
  const heroLastMove = scenario.activeMatch === 'longMissingFields' ? '' : '6 days ago'
  const heroTurn = scenario.activeMatch === 'longMissingFields' ? '' : 'Your turn'

  await page.addInitScript(({ userId, gotwState, heroState, heroOpponent, heroLastMove, heroTurn }) => {
    ;(window as Window & { __E2E_MODE__?: boolean }).__E2E_MODE__ = true
    window.localStorage.setItem('chessHubGotwState', gotwState)
    window.localStorage.setItem('chessHubHeroState', heroState)
    window.localStorage.setItem('chessHubHeroOpponent', heroOpponent)
    window.localStorage.setItem('chessHubHeroLastMove', heroLastMove)
    window.localStorage.setItem('chessHubHeroTurn', heroTurn)

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
  }, {
    userId: TEST_USER_ID,
    gotwState: scenario.gotwState,
    heroState,
    heroOpponent,
    heroLastMove,
    heroTurn,
  })

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
    const hasActiveMatch = scenario.activeMatch !== 'none'
    const gameUpdatedAt = scenario.activeMatch === 'longMissingFields' ? null : sixDaysAgoIso()
    const gameCurrentTurn = scenario.activeMatch === 'longMissingFields' ? null : 'w'

    if (select.includes('game:games(')) {
      if (!hasActiveMatch) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: CORS_HEADERS,
          body: JSON.stringify([]),
        })
      }

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
              updated_at: gameUpdatedAt,
              time_control: { mode: 'none' },
              current_fen: 'startpos',
              current_turn: gameCurrentTurn,
              result: null,
            },
          },
        ]),
      })
    }

    if (!hasActiveMatch) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify([]),
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

    const opponentUsername = scenario.activeMatch === 'longMissingFields'
      ? 'Grandmaster-Opponent-Name-With-Extra-Long-Text-For-Robustness-Checks'
      : 'Alice'

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify([
        { id: TEST_USER_ID, username: 'e2e-test' },
        { id: OPPONENT_ID, username: opponentUsername },
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

async function assertMobileNoScroll(page: Page): Promise<void> {
  const overflowMetrics = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    return {
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      scrollHeight: doc.scrollHeight,
      viewportHeight: window.innerHeight,
    }
  })

  expect(overflowMetrics.docScrollWidth).toBeLessThanOrEqual(overflowMetrics.docClientWidth)
  expect(overflowMetrics.bodyScrollWidth).toBeLessThanOrEqual(overflowMetrics.bodyClientWidth)
  expect(overflowMetrics.scrollHeight).toBeLessThanOrEqual(overflowMetrics.viewportHeight + 2)
}

async function assertModesVisibleAndTappable(page: Page): Promise<void> {
  const modesRegion = page.getByRole('region', { name: 'Modes' })
  const playComputer = modesRegion.getByRole('button', { name: /Play Computer/i })
  const playFriend = modesRegion.getByRole('button', { name: /Play a Friend/i })
  const learnChess = modesRegion.getByRole('button', { name: /Learn Chess/i })

  await expect(playComputer).toBeVisible()
  await expect(playFriend).toBeVisible()
  await expect(learnChess).toBeVisible()

  await expect(playComputer).toBeEnabled()
  await expect(playFriend).toBeEnabled()
  await expect(learnChess).toBeEnabled()

  const rowsMeetTapTarget = await page.locator('[data-testid="chess-mobile-mode-thumb"]').evaluateAll((nodes) => nodes.every((node) => {
    const row = node.closest('button')
    if (!(row instanceof HTMLElement)) return false
    const rect = row.getBoundingClientRect()
    return rect.height >= 44 && rect.width >= 44
  }))
  expect(rowsMeetTapTarget).toBe(true)
}

const MOBILE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 740 },
] as const

const SCENARIOS: ChessMobileScenario[] = [
  {
    name: 'active short opponent',
    activeMatch: 'short',
    gotwState: 'ready',
    expectedHeroCta: 'Continue game',
    expectedHeroEnabled: true,
  },
  {
    name: 'active long opponent and missing lastMove',
    activeMatch: 'longMissingFields',
    gotwState: 'ready',
    expectedHeroCta: 'Continue game',
    expectedHeroEnabled: true,
  },
  {
    name: 'empty no active match',
    activeMatch: 'none',
    gotwState: 'ready',
    expectedHeroCta: 'Play Computer',
    expectedHeroEnabled: true,
  },
  {
    name: 'gotw missing',
    activeMatch: 'short',
    gotwState: 'missing',
    expectedHeroCta: 'Continue game',
    expectedHeroEnabled: true,
  },
  {
    name: 'gotw error',
    activeMatch: 'short',
    gotwState: 'error',
    expectedHeroCta: 'Continue game',
    expectedHeroEnabled: true,
  },
]

for (const viewport of MOBILE_VIEWPORTS) {
  for (const scenario of SCENARIOS) {
    test(`mobile chess hub ${scenario.name} keeps one-screen contract at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await setupChessHubMobilePage(page, scenario)

      const heroCard = page.getByTestId('chess-mobile-hero-card')
      await expect(heroCard).toBeVisible()
      const heroCta = heroCard.getByRole('button', { name: scenario.expectedHeroCta })
      await expect(heroCta).toBeVisible()
      if (scenario.expectedHeroEnabled) {
        await expect(heroCta).toBeEnabled()
      } else {
        await expect(heroCta).toBeDisabled()
      }

      await assertModesVisibleAndTappable(page)
      await assertMobileNoScroll(page)

      await expect(page.getByText(/VS TEST/i)).toHaveCount(0)

      if (scenario.gotwState === 'missing') {
        await expect(page.getByText('Game of the week is unavailable.')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Watch full game' })).toHaveCount(0)
      }

      if (scenario.gotwState === 'error') {
        await expect(page.getByText('Unable to load game of the week.')).toBeVisible()
      }
    })
  }
}
