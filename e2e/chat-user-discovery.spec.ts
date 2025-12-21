import { test, expect } from '@playwright/test'
import { acceptDisclaimer } from './helpers/disclaimer'

test('E2E chat: user discovery → start DM (no photo required)', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.__E2E_MODE__ = true
  })

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  // Backend E2E auth verification route (AuthContext uses this in VITE_E2E mode)
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

  // Current user profile (public.users)
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

  // Preferences endpoint (AuthContext)
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

  // Accept terms endpoint (used by disclaimer modal flow)
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

  // --- Supabase mocks (chat uses Supabase client directly) ---
  // The Playwright config sets VITE_SUPABASE_URL to http://127.0.0.1:5173/__supabase

  const targetUser = {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'e2e-target',
    avatar_url: null,
  }

  const room = {
    id: '33333333-3333-4333-8333-333333333333',
    name: null,
    is_group: false,
    created_at: new Date().toISOString(),
  }

  // Users search
  await page.route('**/__supabase/rest/v1/users**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }

    if (method !== 'GET') return route.fulfill({ status: 405, headers: corsHeaders, body: '' })

    const url = new URL(route.request().url())
    const usernameFilter = url.searchParams.get('username') || ''

    // Supabase sends ilike patterns like ilike.*query*
    const query = usernameFilter.replace(/^ilike\./, '')

    const results: Array<{ id: string; username: string; avatar_url: null }> = []
    if (query.toLowerCase().includes('e2e')) {
      results.push({ id: '11111111-1111-4111-8111-111111111111', username: 'e2e-test', avatar_url: null })
      results.push({ id: targetUser.id, username: targetUser.username, avatar_url: null })
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(results),
    })
  })

  // Room members lookups (fetchRooms + dm intersection logic)
  await page.route('**/__supabase/rest/v1/room_members**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }

    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify([]) })
    }

    if (method === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify([]) })
    }

    return route.fulfill({ status: 405, headers: corsHeaders, body: '' })
  })

  // Create room (getOrCreateRoom)
  await page.route('**/__supabase/rest/v1/rooms**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }

    if (method === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(room) })
    }

    if (method === 'GET') {
      // Header query after navigation
      return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify([room]) })
    }

    return route.fulfill({ status: 405, headers: corsHeaders, body: '' })
  })

  // Messages initial fetch
  await page.route('**/__supabase/rest/v1/messages**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify([]) })
    }
    if (method === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({}) })
    }
    return route.fulfill({ status: 405, headers: corsHeaders, body: '' })
  })

  // Minimal: avoid navigation flakiness by ensuring any auth endpoints don't hard-fail if called
  await page.route('**/__supabase/auth/v1/**', async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' })
    }
    // Return 200 with empty body for incidental calls; chat auth is bypassed in E2E via api.ts
    return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({}) })
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

  await page.goto('http://127.0.0.1:5173/chat', { waitUntil: 'networkidle' })
  await acceptDisclaimer(page)

  await expect(page.getByTestId('chat-page')).toBeVisible({ timeout: 10000 })

  // Empty state CTA should be present (no rooms)
  await expect(page.getByRole('button', { name: 'Find someone to chat with.' })).toBeVisible({ timeout: 10000 })

  // Open discovery modal
  await page.getByTestId('chat-new-message').click()

  const modal = page.getByRole('dialog', { name: 'Start new chat' })
  await expect(modal).toBeVisible({ timeout: 5000 })

  await modal.getByRole('searchbox', { name: 'Search users' }).fill('e2e')

  // Pick the target user (not self)
  await modal.getByText('e2e-target', { exact: true }).click()

  // Auto-navigate to /chat/:roomId and close modal
  await expect(page).toHaveURL(new RegExp(`/chat/${room.id}$`), { timeout: 10000 })
  await expect(modal).not.toBeVisible({ timeout: 10000 })

  // Chat window loads
  await expect(page.getByTestId('chat-messages')).toBeVisible({ timeout: 10000 })
})
