import type { Page, Route } from '@playwright/test'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function mockCoreApi(page: Page): Promise<void> {
  await page.route('**/photos/dependencies', async (route: Route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    if (method !== 'GET') {
      return route.fulfill({ status: 405, headers: CORS_HEADERS, body: '' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, dependencies: { aiQueue: false } }),
    })
  })

  await page.route('**/api/meta', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ buildId: 'e2e-build', bootId: 'e2e-boot' }),
    })
  })

  await page.route('**/api/comments**', async (route: Route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
    }

    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, data: [] }),
      })
    }

    if (method === 'POST') {
      const body = await route.request().postDataJSON().catch(() => ({} as Record<string, unknown>))
      const createdAt = new Date().toISOString()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          data: {
            id: 'e2e-comment-1',
            photo_id: body?.photoId ?? null,
            content: body?.content ?? '',
            created_at: createdAt,
            user_id: 'e2e-user',
          },
        }),
      })
    }

    return route.fulfill({ status: 405, headers: CORS_HEADERS, body: '' })
  })
}
