import type { APIRequestContext } from '@playwright/test'

export async function fetchCsrfToken(
  request: APIRequestContext,
  baseUrl = 'http://127.0.0.1:3001',
): Promise<string> {
  const res = await request.get(`${baseUrl}/csrf`)
  if (!res.ok()) {
    throw new Error(`Failed to fetch CSRF token: ${res.status()} ${res.statusText()}`)
  }

  const json = (await res.json().catch(() => null)) as { csrfToken?: unknown } | null
  const token = json && typeof json.csrfToken === 'string' ? json.csrfToken : null
  if (!token) {
    throw new Error('Failed to fetch CSRF token: missing csrfToken')
  }
  return token
}
