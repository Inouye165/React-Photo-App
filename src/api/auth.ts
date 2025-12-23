import { supabase } from '../supabaseClient'
import { request, ApiError } from './httpClient'

// --- Token Management ---
let _cachedAccessToken: string | null = null

export function setAuthToken(token: string | null): void {
  _cachedAccessToken = token
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
      _cachedAccessToken = session.access_token
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
