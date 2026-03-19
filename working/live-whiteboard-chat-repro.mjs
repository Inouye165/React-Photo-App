import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

for (const relativePath of ['.env.local', '.env', 'server/.env.local', 'server/.env']) {
  const envPath = path.join(repoRoot, relativePath)
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false })
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const appUrl = process.env.LIVE_REPRO_APP_URL || 'http://127.0.0.1:5173'

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase env. Expected SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.')
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function log(step, details) {
  const suffix = details == null ? '' : ` ${JSON.stringify(details)}`
  console.log(`[live-whiteboard-chat] ${step}${suffix}`)
}

function fail(message, details) {
  const suffix = details == null ? '' : ` ${JSON.stringify(details)}`
  throw new Error(`${message}${suffix}`)
}

async function createUser({ email, password, username }) {
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  })

  if (created.error || !created.data.user) {
    fail('Failed to create user', { email, error: created.error?.message || null })
  }

  const userId = created.data.user.id

  const profileUpdate = await supabaseAdmin
    .from('users')
    .update({ username, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (profileUpdate.error) {
    fail('Failed to update public.users profile', { userId, username, error: profileUpdate.error.message })
  }

  return created.data.user
}

async function createWhiteboardRoom(ownerId, memberId) {
  const roomInsert = await supabaseAdmin
    .from('rooms')
    .insert({
      name: `Live Whiteboard ${new Date().toISOString()}`,
      is_group: true,
      type: 'whiteboard',
      created_by: ownerId,
      metadata: { liveRepro: true },
    })
    .select('id, name, created_by, type')
    .single()

  if (roomInsert.error || !roomInsert.data) {
    fail('Failed to create whiteboard room', { error: roomInsert.error?.message || null })
  }

  const room = roomInsert.data

  const membersInsert = await supabaseAdmin
    .from('room_members')
    .insert([
      { room_id: room.id, user_id: ownerId, is_owner: true },
      { room_id: room.id, user_id: memberId, is_owner: false },
    ])

  if (membersInsert.error) {
    fail('Failed to create room memberships', { roomId: room.id, error: membersInsert.error.message })
  }

  return room
}

async function getRoomMessages(roomId) {
  const result = await supabaseAdmin
    .from('messages')
    .select('id, room_id, sender_id, content, photo_id, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  if (result.error) {
    fail('Failed to fetch room messages', { roomId, error: result.error.message })
  }

  return result.data || []
}

async function seedContext(context, userId) {
  await context.addInitScript(({ acceptedUserId }) => {
    window.localStorage.setItem(`terms_accepted_${acceptedUserId}`, 'true')
  }, { acceptedUserId: userId })
}

function attachPageLogging(page, label) {
  page.on('console', (msg) => {
    console.log(`[${label}:console:${msg.type()}] ${msg.text()}`)
  })

  page.on('request', (request) => {
    const url = request.url()
    if (
      url.includes('/api/v1/chat/rooms/') ||
      url.includes('/api/users/me') ||
      url.includes('/api/whiteboards/') ||
      url.includes('/rest/v1/messages') ||
      url.includes('/rest/v1/room_members')
    ) {
      console.log(`[${label}:request] ${request.method()} ${url}`)
    }
  })

  page.on('response', async (response) => {
    const url = response.url()
    if (
      !url.includes('/api/v1/chat/rooms/') &&
      !url.includes('/api/users/me') &&
      !url.includes('/api/whiteboards/') &&
      !url.includes('/rest/v1/messages') &&
      !url.includes('/rest/v1/room_members')
    ) {
      return
    }

    let body = null
    try {
      const text = await response.text()
      body = text.length > 400 ? `${text.slice(0, 400)}...` : text
    } catch {
      body = null
    }

    console.log(`[${label}:response] ${response.status()} ${url}${body ? ` ${body}` : ''}`)
  })

  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.includes('/api/v1/chat/rooms/') || url.includes('/rest/v1/messages') || url.includes('/rest/v1/room_members')) {
      console.log(`[${label}:requestfailed] ${request.method()} ${url} ${request.failure()?.errorText || 'unknown'}`)
    }
  })
}

async function dumpPageState(page, label) {
  const buttons = await page.getByRole('button').evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.textContent?.trim() || '',
      ariaLabel: node.getAttribute('aria-label') || '',
    })),
  ).catch(() => [])

  const headings = await page.getByRole('heading').allTextContents().catch(() => [])
  const bodyText = await page.locator('body').innerText().catch(() => '')
  const screenshotPath = path.join(repoRoot, 'working', `${label}-whiteboard-repro.png`)

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined)

  log('page-dump', {
    label,
    url: page.url(),
    title: await page.title().catch(() => ''),
    headings,
    buttons,
    screenshotPath,
    bodyText: bodyText.slice(0, 1500),
  })
}

async function dumpChatDomState(page, label) {
  const chatState = await page.evaluate(() => {
    const activeTab = Array.from(document.querySelectorAll('[role="tab"]')).find((node) =>
      node.getAttribute('aria-selected') === 'true',
    )
    const chatMessages = document.querySelector('[data-testid="chat-messages"]')
    const composer = document.querySelector('[data-testid="chat-composer"]')
    const composerInput = document.querySelector('[data-testid="chat-composer-input"]')
    const chatWindow = document.querySelector('[aria-label="Chat window"]')

    return {
      activeTabText: activeTab?.textContent?.trim() || null,
      hasChatWindow: Boolean(chatWindow),
      chatWindowText: chatWindow?.textContent?.trim().slice(0, 1200) || null,
      hasChatMessages: Boolean(chatMessages),
      chatMessagesText: chatMessages?.textContent?.trim().slice(0, 1200) || null,
      hasComposer: Boolean(composer),
      hasComposerInput: Boolean(composerInput),
      composerTag: composerInput?.tagName || null,
    }
  }).catch(() => null)

  log('chat-dom-dump', { label, url: page.url(), chatState })
}

async function ensureChatPanel(page) {
  const input = page.getByTestId('chat-composer-input')
  if (await input.isVisible().catch(() => false)) return input

  const chatTab = page.getByRole('tab', { name: 'Chat' })
  if (await chatTab.isVisible().catch(() => false)) {
    await chatTab.click()
    await dumpChatDomState(page, 'after-chat-tab-click')
    if (await input.isVisible().catch(() => false)) {
      return input
    }

    const fallbackInput = page.getByRole('textbox', { name: 'Message student' })
    if (await fallbackInput.isVisible().catch(() => false)) {
      log('fallback-chat-panel-visible', { url: page.url() })
      return fallbackInput
    }

    await dumpChatDomState(page, 'before-chat-input-timeout')
    await dumpPageState(page, 'chat-missing-after-tab')
    await input.waitFor({ state: 'visible', timeout: 15000 })
    return input
  }

  const openPanelButton = page.getByRole('button', { name: 'Open panel' })
  try {
    await openPanelButton.waitFor({ state: 'visible', timeout: 15000 })
  } catch (error) {
    await dumpPageState(page, 'panel-missing')
    throw error
  }
  await openPanelButton.click()
  await input.waitFor({ state: 'visible', timeout: 15000 })
  return input
}

async function reloadAndReopen(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await ensureChatPanel(page)
}

async function completeOnboardingIfNeeded(page, { username, password }) {
  if (!page.url().includes('/reset-password')) {
    log('onboarding-not-needed', { url: page.url() })
    return
  }

  const setupButton = page.getByRole('button', { name: /^Complete Setup$/i })
  if (!(await setupButton.isVisible().catch(() => false))) {
    log('onboarding-button-missing', { url: page.url() })
    return
  }

  log('onboarding-start', { url: page.url(), username })
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('#confirm-password').fill(password)
  await setupButton.click()
  await page.waitForLoadState('networkidle').catch(() => undefined)

  if (page.url().includes('/reset-password')) {
    const bodyText = await page.locator('body').innerText().catch(() => '')
    log('onboarding-still-active', {
      url: page.url(),
      bodyText: bodyText.slice(0, 800),
    })
  } else {
    log('onboarding-complete', { url: page.url() })
  }
}

async function loginThroughUi(page, { email, password, userId, username }) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /I have an account/i }).click()
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /^Sign in$/i }).click()

  await page.waitForLoadState('networkidle').catch(() => undefined)
  await completeOnboardingIfNeeded(page, { username, password })

  const userMenu = page.getByTestId('user-menu-trigger')
  try {
    await userMenu.waitFor({ state: 'visible', timeout: 20000 })
  } catch (error) {
    const currentUrl = page.url()
    if (!currentUrl.includes('/reset-password') && !currentUrl.includes('/login') && !currentUrl.endsWith(':5173/')) {
      log('login-succeeded-without-user-menu', { userId, url: currentUrl })
      return
    }

    await dumpPageState(page, `login-failed-${userId}`)
    throw error
  }
}

async function sendAndVerify({ senderPage, receiverPage, roomId, text, senderLabel, receiverLabel }) {
  const input = await ensureChatPanel(senderPage)
  await input.fill(text)
  await senderPage.getByTestId('chat-composer-send').click()
  await senderPage.getByText(text).waitFor({ state: 'visible', timeout: 20000 })

  await ensureChatPanel(receiverPage)
  await receiverPage.getByText(text).waitFor({ state: 'visible', timeout: 20000 })
  log('message-visible-live', { senderLabel, receiverLabel, text })

  const messagesAfterSend = await getRoomMessages(roomId)
  log('messages-after-send', { senderLabel, count: messagesAfterSend.length, texts: messagesAfterSend.map((m) => m.content) })

  await reloadAndReopen(senderPage)
  await senderPage.getByText(text).waitFor({ state: 'visible', timeout: 20000 })

  await reloadAndReopen(receiverPage)
  await receiverPage.getByText(text).waitFor({ state: 'visible', timeout: 20000 })

  log('message-visible-after-reload', { senderLabel, receiverLabel, text })
}

async function main() {
  const timestamp = Date.now()
  const studentEmail = `wb-student-${timestamp}@example.com`
  const tutorEmail = `wb-tutor-${timestamp}@example.com`
  const password = 'Passw0rd!Passw0rd!'

  log('creating-users', { studentEmail, tutorEmail })

  const studentUser = await createUser({ email: studentEmail, password, username: `wbstudent${timestamp}` })
  const tutorUser = await createUser({ email: tutorEmail, password, username: `wbtutor${timestamp}` })
  const room = await createWhiteboardRoom(studentUser.id, tutorUser.id)

  log('room-created', { roomId: room.id, roomName: room.name, ownerId: room.created_by })

  const browser = await chromium.launch({ headless: true })
  const studentContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } })
  const tutorContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } })

  await seedContext(studentContext, studentUser.id)
  await seedContext(tutorContext, tutorUser.id)

  const studentPage = await studentContext.newPage()
  const tutorPage = await tutorContext.newPage()
  attachPageLogging(studentPage, 'student')
  attachPageLogging(tutorPage, 'tutor')

  await loginThroughUi(studentPage, {
    email: studentEmail,
    password,
    userId: studentUser.id,
    username: `wbstudent${timestamp}`,
  })
  await loginThroughUi(tutorPage, {
    email: tutorEmail,
    password,
    userId: tutorUser.id,
    username: `wbtutor${timestamp}`,
  })

  const targetUrl = `${appUrl}/whiteboards/${room.id}`
  log('opening-pages', { targetUrl })

  await Promise.all([
    studentPage.goto(targetUrl, { waitUntil: 'domcontentloaded' }),
    tutorPage.goto(targetUrl, { waitUntil: 'domcontentloaded' }),
  ])

  await Promise.all([
    ensureChatPanel(studentPage),
    ensureChatPanel(tutorPage),
  ])

  const firstMessage = `student-live-message-${timestamp}`
  const secondMessage = `tutor-live-message-${timestamp}`

  await sendAndVerify({
    senderPage: studentPage,
    receiverPage: tutorPage,
    roomId: room.id,
    text: firstMessage,
    senderLabel: 'student',
    receiverLabel: 'tutor',
  })

  await sendAndVerify({
    senderPage: tutorPage,
    receiverPage: studentPage,
    roomId: room.id,
    text: secondMessage,
    senderLabel: 'tutor',
    receiverLabel: 'student',
  })

  const finalMessages = await getRoomMessages(room.id)
  log('final-messages', finalMessages)

  await studentContext.close()
  await tutorContext.close()
  await browser.close()
}

main().catch((error) => {
  console.error('[live-whiteboard-chat] fatal', error)
  process.exitCode = 1
})