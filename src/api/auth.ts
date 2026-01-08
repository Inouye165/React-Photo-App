import { getSessionSingleflight } from '../lib/supabaseSession'
import { request, ApiError } from './httpClient'

// --- Token Management ---
let _cachedAccessToken: string | null = null

type AuthTokenState = 'unknown' | 'set' | 'cleared'
let _authTokenState: AuthTokenState = 'unknown'

function canAttemptSessionRefresh(): boolean {
  return _authTokenState !== 'cleared'
}

export function setAuthToken(token: string | null): void {
  _cachedAccessToken = token
  _authTokenState = token ? 'set' : 'cleared'
  console.log(`[API Auth] Token updated. State: ${_authTokenState.toUpperCase()}`)
}

export function getAccessToken(): string | null {
  return _cachedAccessToken
}

export function getHeadersForGetRequest(): Record<string, string> | undefined {
  if (_cachedAccessToken) {
    return { Authorization: `Bearer ${_cachedAccessToken}` }
  }
  return undefined
}

export async function getHeadersForGetRequestAsync(): Promise<Record<string, string> | undefined> {
  if (_cachedAccessToken) {
    return { Authorization: `Bearer ${_cachedAccessToken}` }
  }

  if (!canAttemptSessionRefresh()) {
    return undefined
  }

  try {
    const session = await getSessionSingleflight()
    const token = session?.access_token ?? null
    if (token) {
      _cachedAccessToken = token
      _authTokenState = 'set'
      return { Authorization: `Bearer ${token}` }
    }

    // Session resolved but no token; treat as logged out.
    _authTokenState = 'cleared'
    return undefined
  } catch {
    // Fall through without token
  }

  return undefined
}

export function getAuthHeaders(includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }
  if (_cachedAccessToken) {
    headers['Authorization'] = `Bearer ${_cachedAccessToken}`
  } else {
    console.warn('[API Auth] getAuthHeaders called with no cached token present')
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
    return headers
  }

  try {
    const session = await getSessionSingleflight()
    const token = session?.access_token ?? null
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      _cachedAccessToken = token
      _authTokenState = 'set'
    } else {
      // Session resolved but no token; treat as logged out.
      _authTokenState = 'cleared'
    }
  } catch {
    // Fall through without token
  }

  return headers
}

// --- User Profile ---
export interface UserProfile {
  id: string
  username: string | null
  has_set_username: boolean
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
