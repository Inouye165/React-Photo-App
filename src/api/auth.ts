import { getSessionSingleflight } from '../lib/supabaseSession'
import { request, ApiError } from './httpClient'
import { setAuthHeaderProvider } from './authHeaderProvider'
import { authDebug } from '../utils/authDebug'

// --- Token Management ---
let _cachedAccessToken: string | null = null
const tokenListeners = new Set<(token: string | null) => void>()

type AuthTokenState = 'unknown' | 'set' | 'cleared'
let _authTokenState: AuthTokenState = 'unknown'

function isLikelyJwt(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false
  const trimmed = token.trim()
  if (!trimmed) return false
  const parts = trimmed.split('.')
  if (parts.length !== 3) return false
  return parts.every((part) => part.length > 0)
}

function shouldAllowNonJwtTokenForCurrentMode(): boolean {
  try {
    return import.meta.env?.MODE === 'test'
  } catch {
    return false
  }
}

function shouldUseBearerToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false
  if (isLikelyJwt(token)) return true
  return shouldAllowNonJwtTokenForCurrentMode()
}

function canAttemptSessionRefresh(): boolean {
  return _authTokenState !== 'cleared'
}

export function setAuthToken(token: string | null): void {
  const rawToken = token
  if (rawToken && !shouldUseBearerToken(rawToken)) {
    authDebug('token:reject_malformed', {
      tokenPreview: rawToken.slice(0, 16),
      length: rawToken.length,
    })
    token = null
  }

  if (_cachedAccessToken === token) return
  const prevState = _authTokenState
  _cachedAccessToken = token
  _authTokenState = token ? 'set' : 'cleared'
  authDebug('token:update', {
    prevState,
    nextState: _authTokenState,
    hasToken: Boolean(token),
  })

  for (const listener of tokenListeners) {
    try {
      listener(token)
    } catch {
      // ignore
    }
  }
}

export function onAuthTokenChange(listener: (token: string | null) => void): () => void {
  tokenListeners.add(listener)
  return () => tokenListeners.delete(listener)
}

export function getAccessToken(): string | null {
  const t = _cachedAccessToken
  return t
}

export function getHeadersForGetRequest(): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  if (shouldUseBearerToken(_cachedAccessToken)) {
    headers.Authorization = `Bearer ${_cachedAccessToken}`
  } else if (_cachedAccessToken) {
    setAuthToken(null)
  }
  if (typeof window !== 'undefined' && (window as any).__E2E_MODE__) {
    headers['X-E2E-User-ID'] = '11111111-1111-4111-8111-111111111111'
  }
  return Object.keys(headers).length ? headers : undefined
}

export async function getHeadersForGetRequestAsync(): Promise<Record<string, string> | undefined> {
  const headers: Record<string, string> = {}
  if (shouldUseBearerToken(_cachedAccessToken)) {
    headers.Authorization = `Bearer ${_cachedAccessToken}`
  } else if (_cachedAccessToken) {
    setAuthToken(null)
  }

  if (typeof window !== 'undefined' && (window as any).__E2E_MODE__) {
    headers['X-E2E-User-ID'] = '11111111-1111-4111-8111-111111111111'
  }

  if (Object.keys(headers).length) {
    return headers
  }

  if (!canAttemptSessionRefresh()) {
    authDebug('headers:get:refresh_skipped', { reason: 'token_state_cleared' })
    return undefined
  }

  try {
    authDebug('headers:get:refresh_attempt')
    const session = await getSessionSingleflight()
    const token = session?.access_token ?? null
    if (shouldUseBearerToken(token)) {
      setAuthToken(token)
      authDebug('headers:get:refresh_success', { hasToken: true })
      headers.Authorization = `Bearer ${token}`
      return headers
    }

    // Session resolved but no token; treat as logged out.
    _authTokenState = 'cleared'
    authDebug('headers:get:refresh_empty', { hasToken: false })
    return Object.keys(headers).length ? headers : undefined
  } catch {
    authDebug('headers:get:refresh_error')
    // Fall through without token
  }

  return Object.keys(headers).length ? headers : undefined
}

export function getAuthHeaders(includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }
  if (shouldUseBearerToken(_cachedAccessToken)) {
    headers['Authorization'] = `Bearer ${_cachedAccessToken}`
  } else if (_cachedAccessToken) {
    setAuthToken(null)
  }
  // E2E Bypass: Add header if in E2E mode
  if (typeof window !== 'undefined' && (window as any).__E2E_MODE__) {
    headers['X-E2E-User-ID'] = '11111111-1111-4111-8111-111111111111';
  }
  return headers
}

export async function getAuthHeadersAsync(includeContentType = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}

  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }

  // E2E Bypass: Add header if in E2E mode
  if (typeof window !== 'undefined' && (window as any).__E2E_MODE__) {
    headers['X-E2E-User-ID'] = '11111111-1111-4111-8111-111111111111';
  }

  if (!canAttemptSessionRefresh() && !_cachedAccessToken) {
    authDebug('headers:auth:refresh_skipped', { reason: 'token_state_cleared' })
    return headers
  }

  try {
    authDebug('headers:auth:refresh_attempt')
    const session = await getSessionSingleflight()
    const token = session?.access_token ?? null
    if (shouldUseBearerToken(token)) {
      headers['Authorization'] = `Bearer ${token}`
      setAuthToken(token)
      authDebug('headers:auth:refresh_success', { hasToken: true })
    } else {
      // Session resolved but no token; treat as logged out.
      _authTokenState = 'cleared'
      authDebug('headers:auth:refresh_empty', { hasToken: false })
    }
  } catch {
    authDebug('headers:auth:refresh_error')
    // Fall through without token
  }

  return headers
}

setAuthHeaderProvider(() => getAuthHeadersAsync(false))

// --- User Profile ---
export interface UserProfile {
  id: string
  username: string | null
  has_set_username: boolean
  avatar_url?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export async function fetchProfile(): Promise<UserProfile | undefined> {
  try {
    const json = await request<{ success?: boolean; data?: unknown; error?: string }>({
      path: '/api/users/me',
      headers: getAuthHeaders(false),
    })
    
    if (!json || !json.success) throw new Error(json?.error || 'Failed to fetch profile')
    return json.data as UserProfile
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return undefined
    }
    throw error
  }
}

export async function updateProfile(username: string): Promise<UserProfile | undefined> {
  try {
    const json = await request<{ success?: boolean; data?: unknown; error?: string }>({
      path: '/api/users/me',
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: { username },
    })

    if (!json || !json.success) throw new Error(json?.error || 'Failed to update profile')
    return json.data as UserProfile
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) return undefined
      if (error.status === 409) {
        throw new Error(error.message || 'Username is already taken')
      }
    }
    throw error
  }
}

export async function updateAvatar(file: File): Promise<UserProfile | undefined> {
  try {
    const form = new FormData()
    form.append('avatar', file, file.name)

    const json = await request<{ success?: boolean; data?: unknown; error?: string }>({
      path: '/api/users/me/avatar',
      method: 'POST',
      headers: getAuthHeaders(false),
      body: form,
    })

    if (!json || !json.success) throw new Error(json?.error || 'Failed to update avatar')
    return json.data as UserProfile
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return undefined
    }
    throw error
  }
}
