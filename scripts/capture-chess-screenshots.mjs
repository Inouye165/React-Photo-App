import { chromium, devices } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://127.0.0.1:5173'
await fs.mkdir('docs', { recursive: true })

async function setupAuthMocks(page) {
  await page.addInitScript(() => {
    window.__E2E_MODE__ = true
  })

  await page.route('**/api/test/e2e-verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        success: true,
        user: {
          id: 'e2e-user',
          email: 'e2e-user@example.com',
          username: 'e2e-user',
          role: 'user',
          app_metadata: { role: 'user' },
          user_metadata: { username: 'e2e-user' },
        },
      }),
    })
  })

  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        success: true,
        data: {
          id: 'e2e-user',
          username: 'e2e-user',
          has_set_username: true,
        },
      }),
    })
  })

  await page.route('**/api/users/accept-terms', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        success: true,
        data: { terms_accepted_at: new Date().toISOString() },
      }),
    })
  })

  await page.route('**/api/meta', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ buildId: 'e2e-build', bootId: 'e2e-boot' }),
    })
  })
}

const browser = await chromium.launch({ headless: true })

const desktopContext = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
})
const desktopPage = await desktopContext.newPage()
await setupAuthMocks(desktopPage)
await desktopPage.goto(`${baseURL}/games/local`, { waitUntil: 'domcontentloaded' })
await desktopPage.getByText('Chess (Local)').waitFor({ timeout: 10000 })
await desktopPage.waitForTimeout(700)
await desktopPage.screenshot({ path: 'docs/chessboard-desktop.png', fullPage: true })
await desktopContext.close()

const mobileContext = await browser.newContext({ ...devices['iPhone 13'] })
const mobilePage = await mobileContext.newPage()
await setupAuthMocks(mobilePage)
await mobilePage.goto(`${baseURL}/games/local`, { waitUntil: 'domcontentloaded' })
await mobilePage.getByText('Chess (Local)').waitFor({ timeout: 10000 })
await mobilePage.waitForTimeout(700)
await mobilePage.screenshot({ path: 'docs/chessboard-mobile.png', fullPage: true })
await mobileContext.close()

const tabletContext = await browser.newContext({ ...devices['iPad (gen 7)'] })
const tabletPage = await tabletContext.newPage()
await setupAuthMocks(tabletPage)
await tabletPage.goto(`${baseURL}/games/local`, { waitUntil: 'domcontentloaded' })
await tabletPage.getByText('Chess (Local)').waitFor({ timeout: 10000 })
await tabletPage.waitForTimeout(700)
await tabletPage.screenshot({ path: 'docs/chessboard-tablet.png', fullPage: true })
await tabletContext.close()

const narrowContext = await browser.newContext({
  viewport: { width: 800, height: 900 },
})
const narrowPage = await narrowContext.newPage()
await setupAuthMocks(narrowPage)
await narrowPage.goto(`${baseURL}/games/local`, { waitUntil: 'domcontentloaded' })
await narrowPage.getByText('Chess (Local)').waitFor({ timeout: 10000 })
await narrowPage.waitForTimeout(700)
await narrowPage.screenshot({ path: 'docs/chessboard-narrow.png', fullPage: true })
await narrowContext.close()

await browser.close()
console.log('Saved docs/chessboard-desktop.png, docs/chessboard-mobile.png, docs/chessboard-tablet.png, docs/chessboard-narrow.png')
