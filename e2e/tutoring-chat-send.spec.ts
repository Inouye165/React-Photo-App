import { test, expect, type Page, type Route } from '@playwright/test'
import { acceptDisclaimer } from './helpers/disclaimer'
import { mockCoreApi } from './helpers/mockCoreApi'

const ROOM_ID = '44444444-4444-4444-8444-444444444444'
const STUDENT_ID = '11111111-1111-4111-8111-111111111111'
const TUTOR_ID = '22222222-2222-4222-8222-222222222222'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
}

type TestUser = {
  id: string
  username: string
  isTutor: boolean
}

type SharedMessage = {
  id: string
  room_id: string
  sender_id: string
  content: string
  photo_id: string | null
  created_at: string
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  })
}

async function setupSharedTutoringChatPage(page: Page, user: TestUser, shared: { messages: SharedMessage[] }) {
  await mockCoreApi(page)

  await page.addInitScript(({ userId }) => {
    window.__E2E_MODE__ = true

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
        email: `${userId}@example.com`,
      },
    }

    const value = JSON.stringify(sessionPayload)
    window.localStorage.setItem('supabase.auth.token', value)
    window.localStorage.setItem('sb-127.0.0.1-auth-token', value)
    window.localStorage.setItem('sb-127.0.0.1:54321-auth-token', value)
    window.localStorage.setItem('sb-localhost-auth-token', value)
    window.localStorage.setItem('sb-localhost:54321-auth-token', value)
  }, { userId: user.id })

  await page.route('**/api/test/e2e-verify', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    await fulfillJson(route, {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.isTutor ? 'tutor' : 'user',
        email: `${user.username}@example.com`,
      },
    })
  })

  await page.route('**/csrf', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    await fulfillJson(route, { csrfToken: 'e2e-csrf-token' })
  })

  await page.route('**/api/users/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    await fulfillJson(route, {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        has_set_username: true,
        is_tutor: user.isTutor,
      },
    })
  })

  await page.route('**/api/users/me/preferences', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    await fulfillJson(route, { success: true, preferences: {} })
  })

  await page.route('**/api/users/accept-terms', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    await fulfillJson(route, { success: true, data: { terms_accepted_at: new Date().toISOString() } })
  })

  await page.route('**/api/v1/activity', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    await fulfillJson(route, { success: true })
  })

  await page.route('**/photos/dependencies', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    await fulfillJson(route, { success: true, dependencies: {} })
  })

  await page.route('**/api/meta', async (route) => {
    await fulfillJson(route, { buildId: 'e2e-build', bootId: 'e2e-boot' })
  })

  await page.route('**/auth/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    const url = route.request().url()
    if (url.includes('/settings')) {
      return fulfillJson(route, { external: {}, disable_signup: false })
    }

    if (url.includes('/user')) {
      return fulfillJson(route, {
        id: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: `${user.username}@example.com`,
      })
    }

    return fulfillJson(route, {})
  })

  await page.route('**/api/v1/chat/rooms/**/messages', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    if (route.request().method() !== 'POST') {
      return route.fulfill({ status: 405, headers: CORS_HEADERS, body: '' })
    }

    let payload: { content?: unknown; photoId?: unknown } = {}
    try {
      payload = route.request().postDataJSON() as { content?: unknown; photoId?: unknown }
    } catch {
      payload = {}
    }

    const nextMessage: SharedMessage = {
      id: `message-${shared.messages.length + 1}`,
      room_id: ROOM_ID,
      sender_id: user.id,
      content: typeof payload.content === 'string' ? payload.content : '',
      photo_id: payload.photoId == null ? null : String(payload.photoId),
      created_at: new Date().toISOString(),
    }
    shared.messages.push(nextMessage)

    await fulfillJson(route, nextMessage, 201)
  })

  await page.route('**/rest/v1/room_members**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    const url = new URL(route.request().url())
    const roomIdEq = url.searchParams.get('room_id')
    const userIdEq = url.searchParams.get('user_id')

    const membershipRows = [
      { room_id: ROOM_ID, user_id: STUDENT_ID, is_owner: true },
      { room_id: ROOM_ID, user_id: TUTOR_ID, is_owner: false },
    ]

    if (typeof roomIdEq === 'string' && roomIdEq.startsWith('eq.')) {
      const roomId = roomIdEq.slice(3)
      const rows = membershipRows
        .filter((item) => item.room_id === roomId)
        .map((item) => ({ user_id: item.user_id, is_owner: item.is_owner }))
      return fulfillJson(route, rows)
    }

    if (typeof userIdEq === 'string' && userIdEq.startsWith('eq.')) {
      const userId = userIdEq.slice(3)
      const rows = membershipRows.filter((item) => item.user_id === userId).map((item) => ({ room_id: item.room_id }))
      return fulfillJson(route, rows)
    }

    return fulfillJson(route, [])
  })

  await page.route('**/rest/v1/users**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    const url = new URL(route.request().url())
    const idQuery = url.searchParams.get('id') || ''
    const users = [
      { id: STUDENT_ID, username: 'student-user', avatar_url: null },
      { id: TUTOR_ID, username: 'tutor-user', avatar_url: null },
    ]

    if (idQuery.startsWith('eq.')) {
      const match = users.find((item) => item.id === idQuery.slice(3)) ?? null
      return fulfillJson(route, match ? [match] : [])
    }

    if (idQuery.startsWith('in.(') && idQuery.endsWith(')')) {
      const allowed = new Set(idQuery.slice(4, -1).split(',').map((item) => item.trim()).filter(Boolean))
      return fulfillJson(route, users.filter((item) => allowed.has(item.id)))
    }

    return fulfillJson(route, users)
  })

  await page.route('**/rest/v1/rooms**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    await fulfillJson(route, [{
      id: ROOM_ID,
      name: 'Tutoring Board Chat',
      is_group: true,
      created_at: '2026-03-19T00:00:00.000Z',
      created_by: STUDENT_ID,
      type: 'general',
      metadata: {},
    }])
  })

  await page.route('**/rest/v1/messages**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 405, headers: CORS_HEADERS, body: '' })
    }

    await fulfillJson(route, shared.messages)
  })
}

test('E2E tutoring chat: student and tutor can exchange messages in the shared room', async ({ browser }) => {
  const shared = {
    messages: [] as SharedMessage[],
  }

  const student = { id: STUDENT_ID, username: 'student-user', isTutor: false }
  const tutor = { id: TUTOR_ID, username: 'tutor-user', isTutor: true }

  const studentContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } })
  const tutorContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } })

  const studentPage = await studentContext.newPage()
  const tutorPage = await tutorContext.newPage()

  await setupSharedTutoringChatPage(studentPage, student, shared)
  await setupSharedTutoringChatPage(tutorPage, tutor, shared)

  const tutorComposer = tutorPage.locator('[data-testid="chat-composer-input"]:visible').first()
  const tutorSendButton = tutorPage.locator('[data-testid="chat-composer-send"]:visible').first()
  const tutorMessages = tutorPage.locator('[data-testid="chat-messages"]:visible').first()
  const studentComposer = studentPage.locator('[data-testid="chat-composer-input"]:visible').first()
  const studentSendButton = studentPage.locator('[data-testid="chat-composer-send"]:visible').first()
  const studentMessages = studentPage.locator('[data-testid="chat-messages"]:visible').first()

  await tutorPage.goto(`/chat/${ROOM_ID}`, { waitUntil: 'networkidle' })
  await acceptDisclaimer(tutorPage)
  await expect(tutorPage.getByTestId('chat-page')).toBeVisible({ timeout: 10000 })
  await expect(tutorComposer).toBeVisible({ timeout: 10000 })

  await studentPage.goto(`/chat/${ROOM_ID}`, { waitUntil: 'networkidle' })
  await acceptDisclaimer(studentPage)
  await expect(studentPage.getByTestId('chat-page')).toBeVisible({ timeout: 10000 })
  await expect(studentComposer).toBeVisible({ timeout: 10000 })

  const studentMessage = 'Can you check step 2?'
  await studentComposer.fill(studentMessage)
  await studentSendButton.click()
  await expect(studentMessages.getByText(studentMessage).first()).toBeVisible({ timeout: 10000 })

  await tutorPage.reload({ waitUntil: 'networkidle' })
  await acceptDisclaimer(tutorPage)
  await expect(tutorMessages.getByText(studentMessage).first()).toBeVisible({ timeout: 10000 })

  const tutorReply = 'Yes. Subtract 3 before dividing by 2.'
  await tutorComposer.fill(tutorReply)
  await tutorSendButton.click()
  await expect(tutorMessages.getByText(tutorReply).first()).toBeVisible({ timeout: 10000 })

  await studentPage.reload({ waitUntil: 'networkidle' })
  await acceptDisclaimer(studentPage)
  await expect(studentMessages.getByText(tutorReply).first()).toBeVisible({ timeout: 10000 })

  await studentContext.close()
  await tutorContext.close()
})
