import { API_BASE_URL as CENTRAL_API_BASE_URL } from '../config/apiConfig'

export const API_BASE_URL = CENTRAL_API_BASE_URL

// --- CSRF Token (csurf) ---
// The server exposes GET /csrf which returns { csrfToken } and sets the csurf secret cookie.
// We attach X-CSRF-Token for unsafe methods to satisfy CSRF protection while keeping
// credentials behavior unchanged.
let _csrfToken: string | null = null
let _csrfTokenPromise: Promise<string | null> | null = null

export function __resetCsrfTokenForTests(): void {
  _csrfToken = null
  _csrfTokenPromise = null
}

function isUnsafeMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
}

async function getCsrfToken(credentials: RequestCredentials): Promise<string | null> {
  if (_csrfToken) return _csrfToken
  if (_csrfTokenPromise) return _csrfTokenPromise

  _csrfTokenPromise = (async () => {
    try {
      const res = await fetchWithNetworkFallback(`${API_BASE_URL}/csrf`, {
        method: 'GET',
        credentials,
      })
      if (!res.ok) return null
      const json = (await res.json().catch(() => null)) as { csrfToken?: unknown } | null
      const token = json && typeof json.csrfToken === 'string' ? json.csrfToken : null
      _csrfToken = token
      return token
    } catch {
      return null
    } finally {
      _csrfTokenPromise = null
    }
  })()

  return _csrfTokenPromise
}

export type ApiErrorDetails = {
  status?: number
  code?: string
  message: string
  details?: unknown
}

export class ApiError extends Error {
  status?: number
  code?: string
  details?: unknown

  constructor(message: string, options?: { status?: number; code?: string; details?: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.status = options?.status
    this.code = options?.code
    this.details = options?.details
  }
}

// --- Network Failure Tracking ---
let isNetworkDown = false

export function __resetNetworkState(): void {
  isNetworkDown = false
}

type NetworkError = Error & {
  originalError?: unknown
  isNetworkError?: boolean
}

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

export async function fetchWithNetworkFallback(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, init)

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
    if (isAbortError(error)) {
      throw error
    }

    const url = typeof input === 'string' ? input : (input as Request).url || 'unknown'
    const errObj = error as { message?: unknown; constructor?: { name?: unknown } }
    console.error('[Network] Backend request failed', {
      url,
      error: typeof errObj?.message === 'string' ? errObj.message : String(error),
      type: typeof errObj?.constructor?.name === 'string' ? errObj.constructor.name : undefined,
    })

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

    const enhancedError = new Error(
      `Network error: ${typeof errObj?.message === 'string' ? errObj.message : 'Failed to reach server'}`,
    ) as NetworkError
    enhancedError.originalError = error
    enhancedError.isNetworkError = true
    throw enhancedError
  }
}

// --- Concurrency Limiter ---
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

export function __resetApiLimiter(): void {
  apiMetrics.totals.calls = 0
  apiMetrics.limiters = {}
  // We can't easily reset the closure state of existing limiters (active, queue).
  // But we can expose a way to reset them if we refactor createLimiter.
  // For now, let's just hope tests don't exhaust concurrency.
  // Actually, if active count leaks, tests will fail.
  // Let's make createLimiter use the global apiMetrics state for active count?
  // No, active is per limiter instance.
}

function createLimiter(maxConcurrency = 6, name = 'default') {
  let active = 0
  const queue: Array<() => void> = []
  
  // Hook for testing to reset state
  if (process.env.NODE_ENV === 'test') {
      (global as any).__resetLimiters = (global as any).__resetLimiters || [];
      (global as any).__resetLimiters.push(() => {
          active = 0;
          queue.length = 0;
      });
  }

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

export const apiLimiter = createLimiter(6)
export const stateUpdateLimiter = createLimiter(2)

// Some UI flows must never be blocked behind a saturated queue.
// This limiter runs the task immediately (no queue / concurrency cap).
export const directLimiter: (fn: () => Promise<Response>) => Promise<Response> = async (fn) => fn()

export function getApiMetrics(): ApiMetrics {
  try {
    return JSON.parse(JSON.stringify(apiMetrics)) as ApiMetrics
  } catch {
    return { totals: { calls: 0 }, limiters: {} }
  }
}

// --- Auth Error Handling ---
export function handleAuthError(response: Response | null): boolean {
  if (!response) return false
  if (response.status === 401 || response.status === 403) {
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

// --- Request Wrapper ---
export interface RequestOptions {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
  credentials?: RequestCredentials
  limiter?: (fn: () => Promise<Response>) => Promise<Response>
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const {
    path,
    method = 'GET',
    query,
    body,
    headers = {},
    signal,
    timeoutMs,
    credentials = 'include',
    limiter = apiLimiter,
  } = options

  let url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`

  if (query) {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value))
      }
    })
    const queryString = params.toString()
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials,
    signal,
  }

  // Attach CSRF token for unsafe methods.
  // Do this before body handling so callers can still override headers if needed.
  if (isUnsafeMethod(method)) {
    const existingHeaderKey = Object.keys(headers).find((k) => k.toLowerCase() === 'x-csrf-token')
    if (!existingHeaderKey) {
      const token = await getCsrfToken(credentials)
      if (token) {
        ;(fetchOptions.headers as Record<string, string>)['X-CSRF-Token'] = token
      }
    }
  }

  if (body) {
    if (body instanceof FormData) {
      fetchOptions.body = body
      // Content-Type header should be removed for FormData to let browser set boundary
      if (headers['Content-Type']) {
        delete (fetchOptions.headers as Record<string, string>)['Content-Type']
      }
    } else {
      fetchOptions.body = JSON.stringify(body)
      if (!headers['Content-Type']) {
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json'
      }
    }
  }

  let response: Response
  const doFetch = () => {
    if (timeoutMs) {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), timeoutMs)
      const combinedSignal = signal || controller.signal // Simple logic, ideally merge signals
      return fetchWithNetworkFallback(url, { ...fetchOptions, signal: combinedSignal }).finally(() => clearTimeout(id))
    }
    return fetchWithNetworkFallback(url, fetchOptions)
  }

  try {
    response = await limiter(doFetch)
  } catch (error) {
    throw error
  }

  if (handleAuthError(response)) {
    throw new ApiError('Authentication failed', { status: response.status, code: 'AUTH_ERROR' })
  }

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`
    let errorDetails: unknown
    try {
      const json = await response.json()
      errorMessage = json.error || json.message || errorMessage
      errorDetails = json
    } catch {
      try {
        errorMessage = await response.text() || errorMessage
      } catch { /* ignore */ }
    }
    throw new ApiError(errorMessage, { status: response.status, details: errorDetails })
  }

  // If T is void or unknown, we might just return true or empty object?
  // But usually we expect JSON.
  // Some endpoints return empty body.
  if (response.status === 204) {
    return {} as T
  }

  try {
    return (await response.json()) as T
  } catch {
    // If JSON parsing fails, maybe it's text?
    // But we promised T.
    // For now, assume JSON unless T is string.
    return {} as T
  }
}
