import { request, ApiError } from './httpClient'
import { getAuthHeaders, getHeadersForGetRequestAsync } from './auth'

export type CaptureIntentState = 'open' | 'consumed' | 'expired' | 'canceled'

export type CaptureIntent = {
  id: string
  photoId: number | string
  collectibleId?: number | string | null
  state: CaptureIntentState
  createdAt?: string | null
  consumedAt?: string | null
  expiresAt?: string | null
}

export async function openCaptureIntent(params: { photoId: number | string; collectibleId?: number | string | null }) {
  try {
    const json = await request<{ success: boolean; error?: string; intent?: CaptureIntent }>({
      path: '/api/v1/capture-intents/open',
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        photoId: params.photoId,
        collectibleId: params.collectibleId ?? null,
      },
    })
    if (!json.success) throw new Error(json.error || 'Failed to open capture intent')
    return json.intent || null
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null
    throw error
  }
}

export async function getOpenCaptureIntent() {
  try {
    const headers = await getHeadersForGetRequestAsync()
    const json = await request<{ success: boolean; error?: string; intent?: CaptureIntent | null }>({
      path: '/api/v1/capture-intents/open',
      headers: headers || {},
    })
    if (!json.success) throw new Error(json.error || 'Failed to fetch capture intent')
    return json.intent || null
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null
    throw error
  }
}

export async function consumeCaptureIntent(intentId: string) {
  if (!intentId) return null
  try {
    const json = await request<{ success: boolean; error?: string; intent?: CaptureIntent }>({
      path: `/api/v1/capture-intents/${encodeURIComponent(intentId)}/consume`,
      method: 'POST',
      headers: getAuthHeaders(),
    })
    if (!json.success) throw new Error(json.error || 'Failed to consume capture intent')
    return json.intent || null
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) return null
    throw error
  }
}
