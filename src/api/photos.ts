import type { Photo } from '../types/photo'
import type { ModelAllowlistResponse, PhotoState, PhotoStatusResponse } from '../types/api'
import { request, ApiError, fetchWithNetworkFallback, isAbortError, API_BASE_URL, apiLimiter, stateUpdateLimiter, directLimiter } from './httpClient'
import { getAuthHeaders, getAuthHeadersAsync, getHeadersForGetRequestAsync } from './auth'

export type PhotoId = Photo['id']

export interface GetPhotoOptions {
  cacheBust?: boolean
  cacheBuster?: number | string
}

export interface GetPhotosResponse extends Record<string, unknown> {
  success: boolean
  userId?: string
  photos?: Photo[]
  nextCursor?: string | null
  error?: string
}

export interface GetPhotoResponse extends Record<string, unknown> {
  photo?: Photo
  success?: boolean
  error?: string
}

declare global {
  interface Window {
    __imageCacheErrorLogged?: Set<string>
  }
}

// --- Photos API ---

export async function fetchProtectedBlobUrl(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  if (url.startsWith('blob:')) return url

  if (!window.__imageCacheErrorLogged) window.__imageCacheErrorLogged = new Set()

  let signal = options?.signal
  // Legacy argument support omitted for strictness, assuming callers update or use options

  const doFetch = async (bypassCache = false) => {
    const headers = getAuthHeaders(false)
    if (!headers.Authorization) {
      const asyncHeaders = await getAuthHeadersAsync(false)
      if (asyncHeaders.Authorization) headers.Authorization = asyncHeaders.Authorization
    }
    if (bypassCache) {
      headers['Cache-Control'] = 'no-cache'
      headers['Pragma'] = 'no-cache'
    }

    return fetchWithNetworkFallback(url, {
      headers,
      credentials: 'include',
      cache: bypassCache ? 'no-store' : 'default',
      signal,
    })
  }

  let lastError: unknown = null
  let res: Response | null = null
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await doFetch(attempt > 1)
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch (err: unknown) {
      lastError = err

      if (isAbortError(err) || (signal && signal.aborted)) {
        throw err
      }

      const msg = typeof (err as { message?: unknown })?.message === 'string' ? (err as { message: string }).message : ''
      const isCacheError = msg.includes('cache') || msg.includes('Failed to fetch') || Boolean((err as { isNetworkError?: unknown })?.isNetworkError)
      if (!isCacheError) break
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 75 + 50 * attempt))
        continue
      }
    }
  }

  const logKey = `${url}`
  if (!window.__imageCacheErrorLogged.has(logKey)) {
    window.__imageCacheErrorLogged.add(logKey)
    const photoId = url.match(/\/display\/image\/(\d+)/)?.[1] || url
    const err = lastError as { name?: unknown; message?: unknown }
    console.warn('[image-cache-error]', {
      photoId,
      attempts: maxAttempts,
      online: typeof navigator !== 'undefined' ? navigator.onLine : 'unknown',
      errorName: typeof err?.name === 'string' ? err.name : undefined,
      errorMessage: typeof err?.message === 'string' ? err.message : undefined,
    })
  }
  throw (lastError as Error) || new Error('Failed to fetch image after retries')
}

export function revokeBlobUrl(url: string): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export async function getPhotoStatus(): Promise<PhotoStatusResponse> {
  try {
    const headers = await getHeadersForGetRequestAsync()
    return await request<PhotoStatusResponse>({
      path: '/photos/status',
      headers,
      timeoutMs: 10000,
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return { success: false, working: 0, inprogress: 0, finished: 0, total: 0 }
    }
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[getPhotoStatus] Error:', error)
    return { success: false, working: 0, inprogress: 0, finished: 0, total: 0, error: msg }
  }
}

type GetPhotosInflightCache = Map<string, { ts: number; promise: Promise<GetPhotosResponse | undefined> }>

export interface GetPhotosOptions {
  signal?: AbortSignal
  timeoutMs?: number
  limit?: number
  cursor?: string
}

export async function getPhotos(
  serverUrlOrEndpoint: string = `${API_BASE_URL}/photos`,
  options?: GetPhotosOptions,
): Promise<GetPhotosResponse | undefined> {
  let url = serverUrlOrEndpoint
  if (!/^https?:\/\//i.test(serverUrlOrEndpoint)) {
    if (['working', 'inprogress', 'finished'].includes(serverUrlOrEndpoint)) url = `${API_BASE_URL}/photos?state=${serverUrlOrEndpoint}`
    else if (serverUrlOrEndpoint.startsWith('photos')) url = `${API_BASE_URL}/${serverUrlOrEndpoint}`
    else url = `${API_BASE_URL}/photos`
  }
  
  // Add pagination query params if provided
  if (options?.limit !== undefined || options?.cursor !== undefined) {
    const urlObj = new URL(url, window.location.origin)
    if (options.limit !== undefined) {
      urlObj.searchParams.set('limit', String(options.limit))
    }
    if (options.cursor !== undefined) {
      urlObj.searchParams.set('cursor', options.cursor)
    }
    url = urlObj.pathname + urlObj.search
  }

  const root = globalThis as typeof globalThis & { __getPhotosInflight?: GetPhotosInflightCache }
  if (!root.__getPhotosInflight) root.__getPhotosInflight = new Map()
  const TTL = 1000
  const key = url
  const now = Date.now()
  const cached = root.__getPhotosInflight.get(key)
  if (cached && now - cached.ts < TTL) return cached.promise

  const fetchPromise = (async () => {
    try {
      const headers = await getHeadersForGetRequestAsync()
      return await request<GetPhotosResponse>({
        path: url,
        headers,
        timeoutMs: Number.isFinite(options?.timeoutMs as number) ? (options?.timeoutMs as number) : 20000,
        signal: options?.signal,
        limiter: directLimiter,
      })
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
      throw error
    }
  })()

  root.__getPhotosInflight.set(key, { ts: Date.now(), promise: fetchPromise })
  try {
    const res = await fetchPromise
    return res
  } finally {
    setTimeout(() => {
      try {
        root.__getPhotosInflight?.delete(key)
      } catch {
        void 0
      }
    }, TTL)
  }
}

export async function fetchModelAllowlist(serverUrl = `${API_BASE_URL}`): Promise<ModelAllowlistResponse> {
  const root = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>) : (typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {})
  const CACHE_KEY = '__photoModelAllowlistCache'
  const TTL = 60_000
  const now = Date.now()
  const cache = root[CACHE_KEY] as
    | { ts: number; data?: ModelAllowlistResponse; promise?: Promise<ModelAllowlistResponse> }
    | undefined

  if (cache && cache.data && now - cache.ts < TTL) {
    return cache.data
  }
  if (cache && cache.promise) {
    return cache.promise
  }

  const url = `${serverUrl}/photos/models`
  const fetchPromise = (async () => {
    try {
      const headers = await getHeadersForGetRequestAsync()
      const json = await request<Record<string, unknown>>({
        path: url,
        headers,
        limiter: apiLimiter,
      })
      
      const models = Array.isArray(json.models)
        ? (json.models as unknown[]).filter((item): item is string => typeof item === 'string' && item.length > 0)
        : []
      const payload: ModelAllowlistResponse = {
        models,
        source: typeof json.source === 'string' ? json.source : 'unknown',
        updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : null,
      }
      root[CACHE_KEY] = { ts: Date.now(), data: payload }
      return payload
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        const payload: ModelAllowlistResponse = { models: [], source: 'auth', updatedAt: null }
        root[CACHE_KEY] = { ts: Date.now(), data: payload }
        return payload
      }
      throw error
    }
  })()

  root[CACHE_KEY] = { ts: now, promise: fetchPromise }
  try {
    const result = await fetchPromise
    return result
  } catch (error) {
    try {
      delete root[CACHE_KEY]
    } catch {
      /* ignore */
    }
    throw error
  }
}

export async function getDependencyStatus(serverUrl = `${API_BASE_URL}`): Promise<{ success: boolean; dependencies: Record<string, unknown> } | null> {
  try {
    const headers = await getHeadersForGetRequestAsync()
    const json = await request<Record<string, unknown>>({
      path: `${serverUrl}/photos/dependencies`,
      headers,
      limiter: apiLimiter,
    })
    const dependencies =
      json && typeof json.dependencies === 'object' && json.dependencies !== null ? (json.dependencies as Record<string, unknown>) : {}
    return {
      success: json && json.success !== false,
      dependencies,
    }
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null
    throw error
  }
}

export async function updatePhotoState(
  id: PhotoId,
  state: PhotoState,
  serverUrl = `${API_BASE_URL}/photos/`,
): Promise<unknown> {
  try {
    return await request({
      path: `${serverUrl}${id}/state`,
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: { state },
      limiter: stateUpdateLimiter,
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    throw error
  }
}

export async function recheckInprogressPhotos(serverUrl = `${API_BASE_URL}/photos/recheck-inprogress`): Promise<unknown> {
  try {
    return await request({
      path: serverUrl,
      method: 'POST',
      headers: getAuthHeaders(),
      limiter: apiLimiter,
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    throw error
  }
}

export async function recheckPhotoAI(photoId: PhotoId, model: string | null = null, serverUrl = `${API_BASE_URL}`): Promise<unknown> {
  const url = `${serverUrl}/photos/${photoId}/run-ai`
  try {
    const json = await request({
      path: url,
      method: 'POST',
      headers: getAuthHeaders(),
      body: model ? { model } : undefined,
      limiter: apiLimiter,
    })
    
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        try {
          window.dispatchEvent(new CustomEvent('photo:run-ai', { detail: { photoId } }))
        } catch { /* ignore */ }
      }
      try {
        localStorage.setItem('photo:run-ai', JSON.stringify({ photoId, timestamp: Date.now() }))
      } catch { /* ignore */ }
    } catch { /* ignore */ }
    
    return json
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    return null
  }
}

export async function updatePhotoCaption(id: PhotoId, caption: string, serverUrl = `${API_BASE_URL}`): Promise<unknown> {
  try {
    return await request({
      path: `${serverUrl}/photos/${id}/caption`,
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: { caption },
      limiter: apiLimiter,
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    throw error
  }
}

export async function deletePhoto(id: PhotoId, serverUrl = `${API_BASE_URL}`): Promise<unknown> {
  try {
    return await request({
      path: `${serverUrl}/photos/${id}`,
      method: 'DELETE',
      headers: getAuthHeaders(),
      limiter: apiLimiter,
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return undefined
    // Original code returns true if JSON parsing fails but status is ok.
    // request throws if status is not ok.
    // If request returns empty object (204), it returns {}.
    // Original code: return await res.json() catch return true.
    // My request returns {} for 204.
    // If it was 200 OK but not JSON, request returns {}.
    // So returning the result of request is fine, but maybe I should return true if it's empty?
    return true
  }
}

export async function getPhoto(
  photoId: PhotoId,
  options: GetPhotoOptions = {},
  serverUrl = `${API_BASE_URL}`,
): Promise<GetPhotoResponse> {
  const { cacheBust = false, cacheBuster } = options || {}
  let url = `${serverUrl}/photos/${photoId}`

  const shouldBust = Boolean(cacheBust) || typeof cacheBuster !== 'undefined'
  if (shouldBust) {
    const cb = typeof cacheBuster !== 'undefined' ? cacheBuster : Date.now()
    url += (url.includes('?') ? '&' : '?') + `_cb=${cb}`
  }

  try {
    const headers = await getHeadersForGetRequestAsync()
    return await request<GetPhotoResponse>({
      path: url,
      headers,
    })
  } catch (error) {
    // Original code rethrows with status property
    throw error
  }
}
