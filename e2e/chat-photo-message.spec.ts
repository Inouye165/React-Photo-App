import { test, expect } from '@playwright/test'
import { acceptDisclaimer } from './helpers/disclaimer'

// 1x1 transparent PNG
const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6Xnq6kAAAAASUVORK5CYII=',
  'base64',
)

test('E2E chat: renders a photo message (recipient view)', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.__E2E_MODE__ = true
  })

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  // Backend E2E auth verification route
  await page.route('**/api/test/e2e-verify', async (route) => {
    await route.fulfill({
      headers: corsHeaders,
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

  // Current user profile
  await page.route('**/api/users/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
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

  // Preferences endpoint
  await page.route('**/api/users/me/preferences', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ success: true, preferences: {} }),
    })
  })

  // Accept terms endpoint
  await page.route('**/api/users/accept-terms', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ success: true, data: { terms_accepted_at: new Date().toISOString() } }),
    })
  })

  // Supabase mocks
  const room = {
    id: '33333333-3333-4333-8333-333333333333',
    name: null,
    is_group: false,
    created_at: new Date().toISOString(),
  }

  await page.route('**/__supabase/rest/v1/rooms**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify([room]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(room) })
  })

  await page.route('**/__supabase/rest/v1/room_members**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify([]) })
  })

  // Messages initial fetch returns one message with photo_id
  await page.route('**/__supabase/rest/v1/messages**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }

    if (method === 'GET') {
      const message = {
        id: 1,
        room_id: room.id,
        sender_id: '22222222-2222-4222-8222-222222222222',
        content: '',
        photo_id: 101,
        created_at: new Date().toISOString(),
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify([message]),
      })
    }

    if (method === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({}) })
    }

    return route.fulfill({ status: 405, headers: corsHeaders, body: '' })
  })

  // Minimal auth endpoint stub
  await page.route('**/__supabase/auth/v1/**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({}) })
  })

  // Intercept chat-image fetch; AuthenticatedImage will request it and create a blob URL
  await page.route('**/display/chat-image/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
      },
      body: ONE_BY_ONE_PNG,
    })
  })

  // Login: set backend cookie used by /api/test/e2e-verify
  const loginResponse = await context.request.post('http://127.0.0.1:3001/api/test/e2e-login')
  expect(loginResponse.ok()).toBeTruthy()

  const cookies = await context.cookies('http://127.0.0.1:3001')
  for (const cookie of cookies) {
    await context.addCookies([
      {
        name: cookie.name,
        value: cookie.value,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      },
    ])
  }

  await page.goto(`http://127.0.0.1:5173/chat/${room.id}`, { waitUntil: 'networkidle' })
  await acceptDisclaimer(page)

  await expect(page.getByTestId('chat-page')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('chat-messages')).toBeVisible({ timeout: 10_000 })

  // A photo bubble should render an image element after AuthenticatedImage loads
  await expect(page.locator('img[alt="Shared photo"]').first()).toBeVisible({ timeout: 10_000 })
})
