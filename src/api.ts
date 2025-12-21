// --- Collectibles API ---
/**
 * Fetch all collectibles for a given photoId
 */
import type { CollectibleFormState, CollectibleRecord } from './types/collectibles'
import type { Photo } from './types/photo'
import type { ModelAllowlistResponse, PhotoState, PhotoStatusResponse } from './types/api'
import type { ChatMessage, ChatRoom } from './types/chat'

export type PhotoId = Photo['id']
export type CollectibleId = CollectibleRecord['id']

export interface GetPhotoOptions {
  cacheBust?: boolean
  cacheBuster?: number | string
}

export interface UploadPhotoOptions {
  classification?: string
}

export interface GetPhotosResponse extends Record<string, unknown> {
  success: boolean
  photos?: Photo[]
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
    __E2E_MODE__?: boolean
  }
}

export async function fetchCollectibles(photoId: PhotoId): Promise<CollectibleRecord[] | undefined> {
  const url = `${API_BASE_URL}/photos/${photoId}/collectibles`
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(url, { headers: getHeadersForGetRequest(), credentials: 'include' }),
  )
  if (handleAuthError(res)) return
  if (!res.ok) throw new Error('Failed to fetch collectibles: ' + res.status)
  const json = (await res.json()) as { success: boolean; error?: string; collectibles?: CollectibleRecord[] }
  if (!json.success) throw new Error(json.error || 'Failed to fetch collectibles')
  return json.collectibles || []
}

/**
 * Create a new collectible for a photo
 */
export async function createCollectible(
  photoId: PhotoId,
  data: Partial<CollectibleRecord>,
): Promise<CollectibleRecord | undefined> {
  const url = `${API_BASE_URL}/photos/${photoId}/collectibles`
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
      credentials: 'include',
    }),
  )
  if (handleAuthError(res)) return
  if (!res.ok) throw new Error('Failed to create collectible: ' + res.status)
  const json = (await res.json()) as { success: boolean; error?: string; collectible?: CollectibleRecord }
  if (!json.success) throw new Error(json.error || 'Failed to create collectible')
  return json.collectible
}

/**
 * Update a collectible's user_notes
 */
export async function updateCollectible(
  collectibleId: CollectibleId,
  data: Partial<CollectibleRecord>,
): Promise<CollectibleRecord | undefined> {
  const url = `${API_BASE_URL}/collectibles/${collectibleId}`
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(url, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
      credentials: 'include',
    }),
  )
  if (handleAuthError(res)) return
  if (!res.ok) throw new Error('Failed to update collectible: ' + res.status)
  const json = (await res.json()) as { success: boolean; error?: string; collectible?: CollectibleRecord }
  if (!json.success) throw new Error(json.error || 'Failed to update collectible')
  return json.collectible
}

/**
 * Upsert (create or update) a collectible for a photo.
 * Uses PUT method for idempotent upsert semantics.
 */
export async function upsertCollectible(
  photoId: PhotoId,
  data:
    | Partial<CollectibleRecord>
    | {
        formState: CollectibleFormState
      },
  options: { recordAi?: boolean } = {},
): Promise<CollectibleRecord | undefined> {
  const url = `${API_BASE_URL}/photos/${photoId}/collectibles`
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(url, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ...data, ...options }),
      credentials: 'include',
    }),
  )
  if (handleAuthError(res)) return
  if (!res.ok) throw new Error('Failed to upsert collectible: ' + res.status)
  const json = (await res.json()) as { success: boolean; error?: string; collectible?: CollectibleRecord }
  if (!json.success) throw new Error(json.error || 'Failed to upsert collectible')
  return json.collectible
}

// Rewritten clean API module (single copy) with small dedupe caches for
// getPhotos and checkPrivilegesBatch to avoid duplicate network requests
// during dev (StrictMode) or accidental double-invokes.

// --- Helpers
/**
 * Check if an error is an AbortError or cancellation.
 */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybe = error as { name?: unknown; message?: unknown }
  return Boolean(
    typeof maybe.name === 'string' &&
      (maybe.name === 'AbortError' ||
        (typeof maybe.message === 'string' &&
          (maybe.message.includes('aborted') || maybe.message.includes('The user aborted a request')))),
  )
}

// Import supabase client for session access
import { supabase } from './supabaseClient'

// Module-level token cache to avoid repeated async getSession calls
// This is updated by setAuthToken (called from AuthContext on session changes)
// SECURITY: Token stored in module closure, not exposed globally
let _cachedAccessToken: string | null = null

/**
 * Set the current access token for API requests.
 * Called by AuthContext when session changes.
 * SECURITY: Token is stored in module closure, not exposed globally.
 */
export function setAuthToken(token: string | null): void {
  _cachedAccessToken = token
}

/**
 * Get headers for GET requests with Bearer token authentication.
 * Returns Authorization header if token is available, undefined otherwise.
 */
function getHeadersForGetRequest(): Record<string, string> | undefined {
  // Always use Bearer token auth (no cookie fallback)
  if (_cachedAccessToken) {
    return { Authorization: `Bearer ${_cachedAccessToken}` }
  }
  return undefined
}

/**
 * Get the current access token synchronously from cache.
 * Returns null if no token is cached (user not logged in).
 */
export function getAccessToken(): string | null {
  return _cachedAccessToken
}

/**
 * Get headers for API requests with Bearer token authentication.
 */
export function getAuthHeaders(includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }
  if (_cachedAccessToken) {
    headers['Authorization'] = `Bearer ${_cachedAccessToken}`
  }
  return headers
}

/**
 * Async version of getAuthHeaders that fetches fresh token from Supabase.
 * Use this when you need guaranteed fresh token (rare cases like retry after 401).
 */
export async function getAuthHeadersAsync(includeContentType = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}

  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
      // Update cache while we're at it
      _cachedAccessToken = session.access_token
    }
  } catch {
    // Supabase client may not be initialized (e.g., missing env vars)
    // Fall through without token - server will return 401
  }

  return headers
}

// --- User Profile (public.users) ---

export interface UserProfile {
  id: string
  username: string | null
  has_set_username: boolean
  created_at?: string | null
  updated_at?: string | null
}

export async function fetchProfile(): Promise<UserProfile | undefined> {
  const url = `${API_BASE_URL}/api/users/me`
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(url, {
      method: 'GET',
      headers: getAuthHeaders(false),
      credentials: 'include',
    }),
  )
  if (handleAuthError(res)) return
  if (!res.ok) throw new Error('Failed to fetch profile: ' + res.status)

  const json = (await res.json()) as { success?: boolean; data?: unknown; error?: string }
  if (!json || !json.success) throw new Error(json?.error || 'Failed to fetch profile')

  return json.data as UserProfile
}

export async function updateProfile(username: string): Promise<UserProfile | undefined> {
  const url = `${API_BASE_URL}/api/users/me`
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(url, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ username }),
      credentials: 'include',
    }),
  )
  if (handleAuthError(res)) return

  if (res.status === 409) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(json?.error || 'Username is already taken')
  }

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(json?.error || 'Failed to update profile: ' + res.status)
  }

  const json = (await res.json()) as { success?: boolean; data?: unknown; error?: string }
  if (!json || !json.success) throw new Error(json?.error || 'Failed to update profile')

  return json.data as UserProfile
}

function handleAuthError(response: Response | null): boolean {
  if (!response) return false
  if (response.status === 401 || response.status === 403) {
    // Dispatch a custom event that UI components can listen to for graceful handling
    // This prevents infinite reload loops and data loss from hard refreshes
    try {
      window.dispatchEvent(
        new CustomEvent('auth:session-expired', {
          detail: { status: response.status },
        }),
      )
    } catch {
      /* ignore */
    }
    return true
  }
  return false
}

// Network failure tracking (for auto-recovery detection)
let isNetworkDown = false

/**
 * Reset network state (for testing only)
 * @private
 */
export function __resetNetworkState(): void {
  isNetworkDown = false
}

type NetworkError = Error & {
  originalError?: unknown
  isNetworkError?: boolean
}

/**
 * Wrapper around fetch that handles network-level failures gracefully.
 */
async function fetchWithNetworkFallback(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, init)

    // Network is healthy - dispatch recovery event if we were previously down
    if (isNetworkDown) {
      isNetworkDown = false
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('network:recovered'))
        }
      } catch {
        /* ignore */
      }
    }

    return response
  } catch (error: unknown) {
    // Ignore AbortError (user cancelled or component unmounted)
    if (isAbortError(error)) {
      throw error
    }

    // Extract URL for logging (handle both string and Request object)
    const url = typeof input === 'string' ? input : (input as Request).url || 'unknown'

    // Log with context for debugging
    const errObj = error as { message?: unknown; constructor?: { name?: unknown } }
    console.error('[Network] Backend request failed', {
      url,
      error: typeof errObj?.message === 'string' ? errObj.message : String(error),
      type: typeof errObj?.constructor?.name === 'string' ? errObj.constructor.name : undefined,
    })

    // Mark network as down and dispatch event for UI
    if (!isNetworkDown) {
      isNetworkDown = true
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(
            new CustomEvent('network:unavailable', {
              detail: {
                error: typeof errObj?.message === 'string' ? errObj.message : 'Network request failed',
                url,
              },
            }),
          )
        }
      } catch {
        /* ignore */
      }
    }

    // Re-throw with enhanced error message for caller
    const enhancedError = new Error(`Network error: ${typeof errObj?.message === 'string' ? errObj.message : 'Failed to reach server'}`) as NetworkError
    enhancedError.originalError = error
    enhancedError.isNetworkError = true
    throw enhancedError
  }
}

// Use centralized API configuration
import { API_BASE_URL as CENTRAL_API_BASE_URL } from './config/apiConfig'

export const API_BASE_URL = CENTRAL_API_BASE_URL

// --- Concurrency limiter (small utility used across API calls)
interface LimiterMetrics {
  calls: number
  active: number
  queued: number
  maxActiveSeen: number
}

interface ApiMetrics {
  totals: { calls: number }
  limiters: Record<string, LimiterMetrics>
}

const apiMetrics: ApiMetrics = { totals: { calls: 0 }, limiters: {} }

function createLimiter(maxConcurrency = 6, name = 'default') {
  let active = 0
  const queue: Array<() => void> = []
  if (!apiMetrics.limiters[name]) apiMetrics.limiters[name] = { calls: 0, active: 0, queued: 0, maxActiveSeen: 0 }
  const next = () => {
    if (queue.length === 0) return
    const fn = queue.shift()
    apiMetrics.limiters[name].queued = queue.length
    fn?.()
  }

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    apiMetrics.totals.calls += 1
    apiMetrics.limiters[name].calls += 1
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        void (async () => {
          active += 1
          apiMetrics.limiters[name].active = active
          if (active > apiMetrics.limiters[name].maxActiveSeen) apiMetrics.limiters[name].maxActiveSeen = active
          try {
            const r = await fn()
            resolve(r)
          } catch (err: unknown) {
            reject(err)
          } finally {
            active -= 1
            apiMetrics.limiters[name].active = active
            apiMetrics.limiters[name].queued = queue.length
            next()
          }
        })()
      }
      if (active < maxConcurrency) run()
      else {
        queue.push(run)
        apiMetrics.limiters[name].queued = queue.length
      }
    })
  }
}

const apiLimiter = createLimiter(6)
const stateUpdateLimiter = createLimiter(2)

export function getApiMetrics(): ApiMetrics {
  try {
    return JSON.parse(JSON.stringify(apiMetrics)) as ApiMetrics
  } catch {
    return { totals: { calls: 0 }, limiters: {} }
  }
}

/**
 * Fetch a protected resource (image) using Bearer token authentication and return a blob URL.
 * Caller is responsible for revoking the returned URL when no longer needed.
 */
export async function fetchProtectedBlobUrl(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  // If URL is already a blob URL, return it as is
  if (url.startsWith('blob:')) return url

  // Instrumentation: log only once per session for hard failures
  if (!window.__imageCacheErrorLogged) window.__imageCacheErrorLogged = new Set()

  // Accept AbortController signal from options or legacy second argument
  let signal = options?.signal
  if (!signal && arguments.length > 1 && arguments[1] && typeof arguments[1] === 'object') {
    const legacy = arguments[1] as { signal?: AbortSignal }
    signal = legacy.signal
  }

  const doFetch = async (bypassCache = false) => {
    // Get auth headers with Bearer token (without Content-Type for blob requests)
    const headers = getAuthHeaders(false)
    if (bypassCache) {
      headers['Cache-Control'] = 'no-cache'
      headers['Pragma'] = 'no-cache'
    }

    // Note: credentials: 'include' is kept for backward compatibility during transition
    // but Authorization header is now the primary auth mechanism
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

      // If aborted, rethrow immediately to avoid retries and logging
      if (isAbortError(err) || (signal && signal.aborted)) {
        throw err
      }

      // Only retry on network/cache errors
      const msg = typeof (err as { message?: unknown })?.message === 'string' ? (err as { message: string }).message : ''
      const isCacheError = msg.includes('cache') || msg.includes('Failed to fetch') || Boolean((err as { isNetworkError?: unknown })?.isNetworkError)
      if (!isCacheError) break
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 75 + 50 * attempt))
        continue
      }
    }
  }

  // Instrumentation: log only once per session
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

/**
 * Upload a photo to the server, optionally with a client-generated thumbnail.
 */
export async function uploadPhotoToServer(
  file: File,
  serverUrl: string | UploadPhotoOptions = `${API_BASE_URL}/upload`,
  thumbnailBlob: Blob | null = null,
  options: UploadPhotoOptions = {},
): Promise<unknown> {
  // Allow passing options as the 2nd argument for convenience.
  let effectiveServerUrl: string | UploadPhotoOptions = serverUrl
  let effectiveOptions: UploadPhotoOptions = options
  let effectiveThumbnailBlob: Blob | null = thumbnailBlob

  if (serverUrl && typeof serverUrl === 'object' && !(serverUrl instanceof String)) {
    effectiveOptions = serverUrl as UploadPhotoOptions
    effectiveServerUrl = `${API_BASE_URL}/upload`
    effectiveThumbnailBlob = thumbnailBlob
  }

  // Use FormData and rely on cookie-based auth (credentials included).
  const form = new FormData()
  form.append('photo', file, file.name)
  if (effectiveThumbnailBlob) {
    form.append('thumbnail', effectiveThumbnailBlob, 'thumbnail.jpg')
  }

  const classification = effectiveOptions?.classification
  if (typeof classification === 'string' && classification.trim()) {
    form.append('classification', classification.trim())
  }

  const headers = getAuthHeaders()
  delete headers['Content-Type'] // Let browser set multipart/form-data with boundary

  const res = await fetchWithNetworkFallback(effectiveServerUrl as string, {
    method: 'POST',
    headers,
    body: form,
    credentials: 'include',
  })
  if (handleAuthError(res)) return
  if (!res.ok) throw new Error('Upload failed')
  return await res.json()
}

export async function checkPrivilege(relPath: string, serverUrl = `${API_BASE_URL}/privilege`): Promise<unknown> {
  const maxAttempts = 3
  const delayMs = 250
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = JSON.stringify({ relPath })
      const response = await apiLimiter(() =>
        fetchWithNetworkFallback(serverUrl, { method: 'POST', headers: getAuthHeaders(), body, credentials: 'include' }),
      )
      if (handleAuthError(response)) return
      if (response.ok) return await response.json()
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs * attempt))
        continue
      }
      throw new Error('Privilege check failed: ' + response.status)
    } catch (err: unknown) {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs * attempt))
        continue
      }
      throw err
    }
  }
}

type PrivBatchCache = Map<string, { ts: number; promise: Promise<Record<string, unknown>> }>

export async function checkPrivilegesBatch(
  filenames: string[],
  serverUrl = `${API_BASE_URL}/privilege`,
): Promise<Record<string, unknown>> {
  let safe = filenames
  if (!Array.isArray(safe)) safe = []

  const root = globalThis as typeof globalThis & { __privBatchCache?: PrivBatchCache }
  if (!root.__privBatchCache) root.__privBatchCache = new Map()

  const key = safe.slice().sort().join('|')
  const TTL = 1200
  const now = Date.now()
  const existing = root.__privBatchCache.get(key)
  if (existing && now - existing.ts < TTL) return existing.promise

  const CHUNK_SIZE = 12
  const maxAttempts = 4
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const results: Record<string, unknown> = {}

  async function postChunk(chunk: string[], attempt = 1): Promise<Record<string, unknown> | null> {
    try {
      const body = JSON.stringify({ filenames: chunk })
      const response = await apiLimiter(() =>
        fetchWithNetworkFallback(serverUrl, { method: 'POST', headers: getAuthHeaders(), body, credentials: 'include' }),
      )
      if (handleAuthError(response)) return null
      if (response.status === 429) {
        if (attempt < maxAttempts) {
          await sleep(250 * Math.pow(2, attempt - 1))
          return postChunk(chunk, attempt + 1)
        }
        throw new Error('Batch privilege check rate limited: 429')
      }
      if (!response.ok) throw new Error('Batch privilege check failed: ' + response.status)
      const json = (await response.json()) as { success?: boolean; error?: string; privileges?: Record<string, unknown> }
      if (!json.success) throw new Error('Batch privilege check error: ' + (json.error || 'unknown'))
      return json.privileges || {}
    } catch (e: unknown) {
      if (attempt < maxAttempts) {
        await sleep(250 * Math.pow(2, attempt - 1))
        return postChunk(chunk, attempt + 1)
      }
      throw e
    }
  }

  const promise = (async () => {
    for (let i = 0; i < safe.length; i += CHUNK_SIZE) {
      const chunk = safe.slice(i, i + CHUNK_SIZE)
      const chunkRes = await postChunk(chunk, 1)
      if (chunkRes && typeof chunkRes === 'object') Object.assign(results, chunkRes)
    }
    return results
  })()

  root.__privBatchCache.set(key, { ts: Date.now(), promise })
  try {
    const res = await promise
    return res
  } catch (e: unknown) {
    const msg = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : String(e)
    throw new Error('Error checking privileges batch: ' + msg)
  }
}

/**
 * Get lightweight photo status counts for Smart Routing.
 */
export async function getPhotoStatus(): Promise<PhotoStatusResponse> {
  const url = `${API_BASE_URL}/photos/status`
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: getHeadersForGetRequest(),
        credentials: 'include',
      },
      10000,
    )

    if (handleAuthError(response)) {
      // Return empty counts if auth fails - SmartRouter will handle redirect to login
      return { success: false, working: 0, inprogress: 0, finished: 0, total: 0 }
    }

    if (!response.ok) {
      throw new Error('Failed to fetch photo status: ' + response.status)
    }

    return (await response.json()) as PhotoStatusResponse
  } catch (error: unknown) {
    const msg = typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : String(error)
    console.error('[getPhotoStatus] Error:', error)
    // Return safe defaults on error - SmartRouter will redirect to upload page
    return { success: false, working: 0, inprogress: 0, finished: 0, total: 0, error: msg }
  }
}

// Utility: fetch with AbortController and timeout
async function fetchWithTimeout(resource: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetchWithNetworkFallback(resource, { ...options, signal: controller.signal })
    return resp
  } finally {
    clearTimeout(id)
  }
}

type GetPhotosInflightCache = Map<string, { ts: number; promise: Promise<GetPhotosResponse | undefined> }>

export async function getPhotos(serverUrlOrEndpoint: string = `${API_BASE_URL}/photos`): Promise<GetPhotosResponse | undefined> {
  let url = serverUrlOrEndpoint
  if (!/^https?:\/\//i.test(serverUrlOrEndpoint)) {
    if (['working', 'inprogress', 'finished'].includes(serverUrlOrEndpoint)) url = `${API_BASE_URL}/photos?state=${serverUrlOrEndpoint}`
    else if (serverUrlOrEndpoint.startsWith('photos')) url = `${API_BASE_URL}/${serverUrlOrEndpoint}`
    else url = `${API_BASE_URL}/photos`
  }

  const root = globalThis as typeof globalThis & { __getPhotosInflight?: GetPhotosInflightCache }
  if (!root.__getPhotosInflight) root.__getPhotosInflight = new Map()
  const TTL = 1000
  const key = url
  const now = Date.now()
  const cached = root.__getPhotosInflight.get(key)
  if (cached && now - cached.ts < TTL) return cached.promise

  const fetchPromise = (async () => {
    // Protect UI from indefinite hangs if backend is not responding.
    const response = await fetchWithTimeout(url, { headers: getHeadersForGetRequest(), credentials: 'include' }, 20000)
    if (handleAuthError(response)) return
    if (!response.ok) throw new Error('Failed to fetch photos: ' + response.status)
    return (await response.json()) as GetPhotosResponse
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
    const response = await apiLimiter(() =>
      fetchWithNetworkFallback(url, { method: 'GET', headers: getHeadersForGetRequest(), credentials: 'include' }),
    )
    if (handleAuthError(response)) {
      const payload: ModelAllowlistResponse = { models: [], source: 'auth', updatedAt: null }
      root[CACHE_KEY] = { ts: Date.now(), data: payload }
      return payload
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch model allowlist: ${response.status}`)
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
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
  const url = `${serverUrl}/photos/dependencies`
  const response = await apiLimiter(() =>
    fetchWithNetworkFallback(url, { method: 'GET', headers: getHeadersForGetRequest(), credentials: 'include' }),
  )
  if (handleAuthError(response)) return null
  if (!response.ok) {
    throw new Error('Failed to fetch dependency status: ' + response.status)
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  const dependencies =
    json && typeof json.dependencies === 'object' && json.dependencies !== null ? (json.dependencies as Record<string, unknown>) : {}
  return {
    success: json && json.success !== false,
    dependencies,
  }
}

export async function updatePhotoState(
  id: PhotoId,
  state: PhotoState,
  serverUrl = `${API_BASE_URL}/photos/`,
): Promise<unknown> {
  const doFetch = async () =>
    fetchWithNetworkFallback(`${serverUrl}${id}/state`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ state }),
      credentials: 'include',
    })
  const response = await stateUpdateLimiter(() => doFetch())
  if (handleAuthError(response)) return
  if (!response.ok) throw new Error('Failed to update photo state')
  return await response.json()
}

export async function recheckInprogressPhotos(serverUrl = `${API_BASE_URL}/photos/recheck-inprogress`): Promise<unknown> {
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(serverUrl, { method: 'POST', headers: getAuthHeaders(), credentials: 'include' }),
  )
  if (handleAuthError(res)) return
  if (!res.ok) throw new Error('Failed to trigger recheck')
  return await res.json()
}

export async function recheckPhotoAI(photoId: PhotoId, model: string | null = null, serverUrl = `${API_BASE_URL}`): Promise<unknown> {
  const url = `${serverUrl}/photos/${photoId}/run-ai`
  const body = model ? JSON.stringify({ model }) : null
  const opts: RequestInit = {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  }
  if (body) {
    opts.body = body
    const existing = (opts.headers || {}) as Record<string, string>
    opts.headers = { ...existing, 'Content-Type': 'application/json' }
  }
  const res = await apiLimiter(() => fetchWithNetworkFallback(url, opts))
  if (handleAuthError(res)) return
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error('Failed to trigger photo recheck: ' + (text || res.status))
  }
  try {
    const json = await res.json().catch(() => null)
    // Notify other windows/tabs that an AI run has been started for this photo
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        try {
          window.dispatchEvent(new CustomEvent('photo:run-ai', { detail: { photoId } }))
        } catch {
          /* ignore */
        }
      }
      try {
        localStorage.setItem('photo:run-ai', JSON.stringify({ photoId, timestamp: Date.now() }))
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore cross-window notify errors */
    }
    return json
  } catch {
    return null
  }
}

export async function updatePhotoCaption(id: PhotoId, caption: string, serverUrl = `${API_BASE_URL}`): Promise<unknown> {
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(`${serverUrl}/photos/${id}/caption`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ caption }),
      credentials: 'include',
    }),
  )
  if (handleAuthError(res)) return
  if (!res.ok) throw new Error('Failed to update caption')
  return await res.json()
}

export async function deletePhoto(id: PhotoId, serverUrl = `${API_BASE_URL}`): Promise<unknown> {
  const url = `${serverUrl}/photos/${id}`
  const res = await apiLimiter(() =>
    fetchWithNetworkFallback(url, { method: 'DELETE', headers: getAuthHeaders(), credentials: 'include' }),
  )
  if (handleAuthError(res)) return
  if (!res.ok) {
    // Try to parse error body for a useful message
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      try {
        body = await res.text()
      } catch {
        body = null
      }
    }
    const asObj = body && typeof body === 'object' ? (body as { error?: unknown; message?: unknown }) : null
    const msg =
      asObj && (typeof asObj.error === 'string' || typeof asObj.message === 'string')
        ? ((asObj.error as string) || (asObj.message as string))
        : typeof body === 'string' && body.length
          ? body
          : res.statusText || `Failed to delete photo: ${res.status}`
    const err = new Error(msg) as Error & { status?: number }
    // attach status so callers can detect 401/403 and reload if desired
    try {
      err.status = res.status
    } catch {
      /* ignore */
    }
    throw err
  }
  // Return parsed JSON when available, otherwise true
  try {
    return await res.json()
  } catch {
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

  // Cache-busting: force a unique URL to bypass browser/HTTP caches for polling.
  // Back-compat: treat legacy `cacheBuster` as enabling cache busting.
  const shouldBust = Boolean(cacheBust) || typeof cacheBuster !== 'undefined'
  if (shouldBust) {
    const cb = typeof cacheBuster !== 'undefined' ? cacheBuster : Date.now()
    url += (url.includes('?') ? '&' : '?') + `_cb=${cb}`
  }

  const res = await fetchWithNetworkFallback(url, { method: 'GET', headers: getHeadersForGetRequest(), credentials: 'include' })
  if (handleAuthError(res)) {
    const err = new Error('Auth error') as Error & { status?: number }
    try {
      err.status = res.status
    } catch {
      /* ignore */
    }
    throw err
  }
  if (!res.ok) {
    const err = new Error('Failed to fetch photo: ' + res.status) as Error & { status?: number }
    try {
      err.status = res.status
    } catch {
      /* ignore */
    }
    throw err
  }
  return (await res.json()) as GetPhotoResponse
}

// --- Community Chat (Supabase Realtime + RLS tables: public.rooms, public.room_members, public.messages) ---

async function requireAuthedUserId(): Promise<string> {
  const isE2E = import.meta.env.VITE_E2E === 'true' || window.__E2E_MODE__ === true

  // In E2E mode, AuthContext bypasses Supabase auth and relies on a backend test cookie.
  // Chat flows still need a stable user id, so we ask the backend verification route.
  if (isE2E) {
    const res = await fetch(`${API_BASE_URL}/api/test/e2e-verify`, { method: 'GET', credentials: 'include' })
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as
        | { success?: unknown; user?: { id?: unknown } | null }
        | null
      const id = json && json.success && json.user && typeof json.user.id === 'string' ? json.user.id : null
      if (id) return id
    }
    throw new Error('Not authenticated')
  }

  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const id = data?.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}

export type UserSearchResult = {
  id: string
  username: string | null
  avatar_url: string | null
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  // Enforce auth (RLS expectation) while keeping E2E flows working.
  await requireAuthedUserId()

  const { data, error } = await supabase
    .from('users')
    .select('id, username, avatar_url')
    .ilike('username', `%${q}%`)
    .limit(20)

  if (error) throw error

  const rows = (data ?? []) as Array<Partial<UserSearchResult>>
  return rows
    .filter((r): r is UserSearchResult => typeof r.id === 'string')
    .map((r) => ({
      id: r.id,
      username: typeof r.username === 'string' ? r.username : null,
      avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
    }))

}

export async function fetchRooms(): Promise<ChatRoom[]> {
  const userId = await requireAuthedUserId()

  const { data, error } = await supabase
    .from('room_members')
    .select('room_id, rooms!inner(id, name, is_group, created_at)')
    .eq('user_id', userId)

  if (error) throw error

  const rooms = (data ?? [])
    .map((row) => (row as unknown as { rooms?: ChatRoom | null }).rooms)
    .filter((r): r is ChatRoom => Boolean(r))

  // De-dupe by id (defensive) + sort newest-first
  const byId = new Map<string, ChatRoom>()
  for (const r of rooms) byId.set(r.id, r)

  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

export async function getOrCreateRoom(otherUserId: string): Promise<ChatRoom> {
  const userId = await requireAuthedUserId()
  if (!otherUserId) throw new Error('Missing otherUserId')
  if (otherUserId === userId) throw new Error('Cannot create a direct message room with yourself')

  // Option B: Intersection fallback (schema has no deterministic dm_key)
  const [{ data: mine, error: mineError }, { data: theirs, error: theirsError }] = await Promise.all([
    supabase
      .from('room_members')
      .select('room_id, rooms!inner(id, name, is_group, created_at)')
      .eq('user_id', userId)
      .eq('rooms.is_group', false),
    supabase
      .from('room_members')
      .select('room_id, rooms!inner(id, name, is_group, created_at)')
      .eq('user_id', otherUserId)
      .eq('rooms.is_group', false),
  ])

  if (mineError) throw mineError
  if (theirsError) throw theirsError

  const myRoomIds = new Set((mine ?? []).map((r) => (r as unknown as { room_id: string }).room_id))
  const candidates = (theirs ?? [])
    .filter((r) => myRoomIds.has((r as unknown as { room_id: string }).room_id))
    .map((r) => (r as unknown as { rooms?: ChatRoom | null }).rooms)
    .filter((room): room is ChatRoom => Boolean(room))

  if (candidates.length) {
    candidates.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    return candidates[0]
  }

  // Create a new DM room (name NULL, is_group FALSE), then add both members.
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ name: null, is_group: false })
    .select('id, name, is_group, created_at')
    .single()

  if (roomError) throw roomError
  if (!room) throw new Error('Failed to create room')

  const { error: membersError } = await supabase
    .from('room_members')
    .insert([
      { room_id: (room as ChatRoom).id, user_id: userId },
      { room_id: (room as ChatRoom).id, user_id: otherUserId },
    ])

  if (membersError) throw membersError
  return room as ChatRoom
}

export async function sendMessage(roomId: string, content: string): Promise<ChatMessage> {
  const userId = await requireAuthedUserId()
  if (!roomId) throw new Error('Missing roomId')

  const trimmed = content.trim()
  if (!trimmed) throw new Error('Message content is empty')

  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, sender_id: userId, content: trimmed })
    .select('id, room_id, sender_id, content, created_at')
    .single()

  if (error) throw error
  if (!data) throw new Error('Failed to send message')
  return data as ChatMessage
}
