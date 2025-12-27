import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '../supabaseClient'
import useStore from '../store'
import { API_BASE_URL } from '../config/apiConfig'
import { request, setAuthToken } from '../api'
import type { UserProfile } from '../api'

declare global {
  interface Window {
    __E2E_MODE__?: boolean
  }
}

export type AuthActionResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ({ success: true } & T)
  | { success: false; error: string }

export type AuthSession = Session | { user: User; access_token: string }

export interface UserPreferences {
  gradingScales: Record<string, unknown>
  [key: string]: unknown
}

export interface AuthContextValue {
  user: User | null
  session: AuthSession | null
  loading: boolean
  authReady: boolean
  cookieReady: boolean
  preferences: UserPreferences

  // public.users profile (authoritative display identity)
  profile: UserProfile | null
  profileLoading: boolean
  profileError: string | null

  updatePreferences: (newPrefs: Partial<UserPreferences>) => Promise<AuthActionResult<{ data: UserPreferences }>>
  loadDefaultScales: (categories?: string[] | null) => Promise<AuthActionResult<{ data: UserPreferences }>>

  updateProfile: (username: string) => Promise<AuthActionResult<{ profile: UserProfile }>>

  login: (email: string, password: string) => Promise<AuthActionResult<{ user: User | null }>>
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<AuthActionResult<{ user: User | null; session: AuthSession | null }>>
  logout: () => Promise<void>

  signInWithPhone: (phone: string) => Promise<AuthActionResult<{ data: unknown }>>
  verifyPhoneOtp: (phone: string, token: string) => Promise<AuthActionResult<{ user: User | null }>>

  resetPassword: (email: string) => Promise<AuthActionResult<{ data: unknown }>>
  updatePassword: (newPassword: string) => Promise<AuthActionResult>
}

const defaultPreferences: UserPreferences = { gradingScales: {} }

const AuthContext = createContext<AuthContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}

/**
 * Fetch user preferences from the backend
 * Now uses Bearer token auth via getAuthHeaders() in the api module
 */
async function fetchPreferences(): Promise<UserPreferences> {
  try {
    // Import dynamically to avoid circular dependency
    const { getAuthHeaders } = await import('../api')
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    if (response.ok) {
      const json = (await response.json().catch(() => null)) as
        | { success?: unknown; data?: unknown }
        | null

      if (json && json.success && json.data && typeof json.data === 'object') {
        const prefs = json.data as Record<string, unknown>
        const gradingScales =
          prefs.gradingScales && typeof prefs.gradingScales === 'object' ? (prefs.gradingScales as Record<string, unknown>) : {}
        return { ...prefs, gradingScales }
      }
    }

    return { ...defaultPreferences }
  } catch (err) {
    console.warn('Failed to fetch preferences:', err)
    return { ...defaultPreferences }
  }
}

/**
 * Update user preferences on the backend
 */
async function patchPreferences(newPrefs: Partial<UserPreferences>): Promise<UserPreferences | null> {
  try {
    const { getAuthHeaders } = await import('../api')
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(newPrefs),
    })

    if (response.ok) {
      const json = (await response.json().catch(() => null)) as
        | { success?: unknown; data?: unknown }
        | null

      if (json && json.success && json.data && typeof json.data === 'object') {
        const prefs = json.data as Record<string, unknown>
        const gradingScales =
          prefs.gradingScales && typeof prefs.gradingScales === 'object' ? (prefs.gradingScales as Record<string, unknown>) : {}
        return { ...prefs, gradingScales }
      }

      return null
    }

    return null
  } catch (err) {
    console.warn('Failed to update preferences:', err)
    return null
  }
}

/**
 * Load default grading scales from the backend
 */
async function loadDefaultPreferences(categories: string[] | null = null): Promise<UserPreferences | null> {
  try {
    const { getAuthHeaders } = await import('../api')
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences/load-defaults`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ categories }),
    })

    if (response.ok) {
      const json = (await response.json().catch(() => null)) as
        | { success?: unknown; data?: unknown }
        | null

      if (json && json.success && json.data && typeof json.data === 'object') {
        const prefs = json.data as Record<string, unknown>
        const gradingScales =
          prefs.gradingScales && typeof prefs.gradingScales === 'object' ? (prefs.gradingScales as Record<string, unknown>) : {}
        return { ...prefs, gradingScales }
      }

      return null
    }

    return null
  } catch (err) {
    console.warn('Failed to load default preferences:', err)
    return null
  }
}

/**
 * Check if the backend has an E2E test session cookie set.
 * Used for Playwright/Cypress E2E tests to bypass Supabase auth.
 *
 * Note: This will return 401 in normal usage (not in E2E mode), which is expected.
 * The 401 is silently caught here to avoid console noise.
 */
async function checkE2ESession(): Promise<User | null> {
  const isE2E = import.meta.env.VITE_E2E === 'true' || window.__E2E_MODE__ === true
  if (!isE2E) return null

  try {
    const response = await fetch(`${API_BASE_URL}/api/test/e2e-verify`, {
      method: 'GET',
      credentials: 'include',
    })

    if (response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { success?: unknown; user?: unknown }
        | null

      if (data && data.success && data.user && typeof data.user === 'object') {
        return data.user as User
      }
    }

    if (import.meta.env.DEV) {
      console.debug('[AuthContext] No E2E session cookie present (expected in E2E mode)')
    }
    return null
  } catch (err) {
    if (import.meta.env.DEV) {
      console.debug('[AuthContext] E2E session check failed:', getErrorMessage(err))
    }
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  // authReady tracks if auth state is initialized and token is set in the api module
  // Replaces the deprecated cookieReady state
  const [authReady, setAuthReady] = useState<boolean>(false)

  // User preferences (grading scales for collectibles)
  const [preferences, setPreferences] = useState<UserPreferences>({ ...defaultPreferences })

  // public.users profile (username / has_set_username)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState<boolean>(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const lastProfileUserIdRef = useRef<string | null>(null)

  // Track if a login is in progress to prevent onAuthStateChange from racing
  const loginInProgressRef = useRef<boolean>(false)

  // Track if we're in E2E test mode
  const isE2ERef = useRef<boolean>(false)

  // Fetch preferences when auth becomes ready
  useEffect(() => {
    if (authReady && user) {
      fetchPreferences().then(setPreferences)
    }
  }, [authReady, user])

  // Fetch profile from public.users when auth becomes ready.
  // This is the authoritative identity for UI display (never derive from email).
  useEffect(() => {
    if (!authReady || !user) {
      setProfile(null)
      setProfileLoading(false)
      setProfileError(null)
      lastProfileUserIdRef.current = null
      return
    }

    const userId = user.id

    if (lastProfileUserIdRef.current === userId && profile) {
      return
    }

    let cancelled = false

    async function loadProfile() {
      try {
        setProfileLoading(true)
        setProfileError(null)
        // Import dynamically to avoid circular dependency concerns.
        const { fetchProfile } = await import('../api')
        const next = await fetchProfile()
        if (cancelled) return
        if (next) {
          setProfile(next)
          lastProfileUserIdRef.current = userId
        } else {
          setProfile(null)
        }
      } catch (err) {
        if (cancelled) return
        setProfile(null)
        setProfileError(getErrorMessage(err))
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
    // Intentionally omit `profile` from deps to avoid refetch loops.
  }, [authReady, user?.id])

  useEffect(() => {
    const isE2E = import.meta.env.VITE_E2E === 'true' || window.__E2E_MODE__ === true

    if (isE2E) {
      checkE2ESession()
        .then(async (e2eUser) => {
          if (e2eUser) {
            // E2E test mode - bypass Supabase auth
            isE2ERef.current = true
            setAuthToken('e2e-test-token')
            setAuthReady(true)
            setUser(e2eUser)
            setSession({ user: e2eUser, access_token: 'e2e-test-token' })
            setLoading(false)
            return
          }
          setLoading(false)
        })
        .catch(() => {
          setLoading(false)
        })
      return
    }

    // Normal Supabase auth flow
    supabase.auth
      .getSession()
      .then(async ({ data: { session: currentSession } }: { data: { session: Session | null } }) => {
        if (currentSession?.access_token) {
          // Set token in the api module for Bearer auth
          setAuthToken(currentSession.access_token)
          setAuthReady(true)

          // Phase 1: Establish httpOnly cookie session (best-effort, once per session).
          // This enables simple GET requests (no Authorization/Content-Type headers) while
          // keeping credentials: 'include'.
          // Token is now cached for Bearer auth - no cookie sync needed
        }
        setSession(currentSession)
        setUser(currentSession?.user ?? null)
      })
      .catch((error: unknown) => {
        console.error('Auth session initialization error:', error)
        setSession(null)
        setUser(null)
      })
      .finally(() => {
        setLoading(false)
      })

    // Listen for changes (subsequent auth events like token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, nextSession: Session | null) => {
      // Skip if we're in E2E test mode
      if (isE2ERef.current) {
        return
      }
      // Skip if login is being handled by the login function
      if (loginInProgressRef.current) {
        return
      }

      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') && !nextSession) {
        if (import.meta.env.DEV) {
          console.debug('[AuthContext] Session lost during refresh, cleaning up')
        }
        setSession(null)
        setUser(null)
        setAuthToken(null)
        setAuthReady(false)
        // Clear photo store to prevent stale data fetches
        useStore.getState().setPhotos([])

        try {
          await request<{ success: boolean }>({ path: '/api/auth/logout', method: 'POST' })
        } catch {
          // ignore
        }
        return
      }

      if (nextSession?.access_token) {
        setAuthToken(nextSession.access_token)
        setAuthReady(true)
        // Token is now cached for Bearer auth - no cookie sync needed
      } else {
        setAuthToken(null)
        setAuthReady(false)
      }

      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string): Promise<AuthActionResult<{ user: User | null }>> => {
    try {
      // Prevent onAuthStateChange from racing with us
      loginInProgressRef.current = true

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Set Bearer token in the api module BEFORE updating state
      // This makes sure the token is ready for any API calls that happen right after login.
      if (data.session?.access_token) {
        setAuthToken(data.session.access_token)
        // Token is now cached for Bearer auth - no cookie sync needed
        setAuthReady(true)
      }

      // NOW update state - this triggers re-renders and API calls
      setSession(data.session)
      setUser(data.user)

      // Allow onAuthStateChange to work again
      loginInProgressRef.current = false

      return { success: true, user: data.user }
    } catch (err) {
      loginInProgressRef.current = false
      console.error('Login error:', err)
      return { success: false, error: getErrorMessage(err) }
    }
  }

  const register = async (
    username: string,
    email: string,
    password: string,
  ): Promise<AuthActionResult<{ user: User | null; session: AuthSession | null }>> => {
    try {
      loginInProgressRef.current = true

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      })

      if (error) throw error

      // FIX: Only log the user in if Supabase returned a valid session.
      // If email confirmation is enabled, data.session will be null.
      // This keeps the user "logged out" so the UI can show the "Check Email" message.
      if (data.session) {
        if (data.session.access_token) {
          setAuthToken(data.session.access_token)
          setAuthReady(true)
        }
        setSession(data.session)
        setUser(data.user)
      }

      loginInProgressRef.current = false

      return { success: true, user: data.user, session: data.session }
    } catch (err) {
      loginInProgressRef.current = false
      console.error('Registration error:', err)
      return { success: false, error: getErrorMessage(err) }
    }
  }

  const signInWithPhone = async (phone: string): Promise<AuthActionResult<{ data: unknown }>> => {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        phone,
      })

      if (error) throw error
      return { success: true, data }
    } catch (err) {
      console.error('Phone sign-in error:', err)
      return { success: false, error: getErrorMessage(err) }
    }
  }

  const verifyPhoneOtp = async (phone: string, token: string): Promise<AuthActionResult<{ user: User | null }>> => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      })

      if (error) throw error
      return { success: true, user: data.user }
    } catch (err) {
      console.error('OTP verification error:', err)
      return { success: false, error: getErrorMessage(err) }
    }
  }

  const resetPassword = async (email: string): Promise<AuthActionResult<{ data: unknown }>> => {
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (error) throw error
      return { success: true, data }
    } catch (err) {
      console.error('Password reset error:', err)
      return { success: false, error: getErrorMessage(err) }
    }
  }

  const updatePassword = async (newPassword: string): Promise<AuthActionResult> => {
    try {
      if (!newPassword || newPassword.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters' }
      }

      const { data, error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      // Just to be safe: refresh the token cache.
      // Supabase may or may not return a session directly from updateUser depending on server settings.
      const sessionFromUpdate = (data as unknown as { session?: Session | null }).session
      const accessTokenFromUpdate = sessionFromUpdate?.access_token

      if (accessTokenFromUpdate) {
        setAuthToken(accessTokenFromUpdate)
        setAuthReady(true)
        setSession(sessionFromUpdate)
        setUser(sessionFromUpdate.user)
        return { success: true }
      }

      const {
        data: { session: sessionFromGet },
      } = await supabase.auth.getSession()

      if (!sessionFromGet?.access_token) {
        // If we can't confirm a valid session after password update, force cleanup.
        setAuthToken(null)
        setAuthReady(false)
        setSession(null)
        setUser(null)
        return { success: false, error: 'Your session expired. Please sign in again.' }
      }

      setAuthToken(sessionFromGet.access_token)
      setAuthReady(true)
      setSession(sessionFromGet)
      setUser(sessionFromGet.user)

      return { success: true }
    } catch (err) {
      console.error('Update password error:', err)
      // Defense in depth: clear app auth state/token cache on failure to avoid stale-token use.
      try {
        await supabase.auth.signOut()
      } catch {
        // ignore
      }
      setAuthToken(null)
      setAuthReady(false)
      setSession(null)
      setUser(null)
      return { success: false, error: getErrorMessage(err) }
    }
  }

  const logout = async (): Promise<void> => {
    try {
      // Clear Bearer token from the api module
      setAuthToken(null)

      // Clear legacy httpOnly cookie (best effort, will be removed in future)
      try {
        await request<{ success: boolean }>({ path: '/api/auth/logout', method: 'POST' })
      } catch (cookieError) {
        if (import.meta.env.DEV) {
          console.debug('Legacy cookie clear failed (expected if not using cookies):', cookieError)
        }
      }

      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      setSession(null)
      setAuthReady(false)
      setPreferences({ ...defaultPreferences })
      // Clear photo store to prevent stale data
      useStore.getState().setPhotos([])
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  /**
   * Update user preferences (optimistic update)
   */
  const updatePreferences = async (newPrefs: Partial<UserPreferences>): Promise<AuthActionResult<{ data: UserPreferences }>> => {
    // Optimistic update
    const previousPrefs = preferences
    setPreferences((prev) => ({
      ...prev,
      ...newPrefs,
      gradingScales: {
        ...(prev.gradingScales || {}),
        ...(newPrefs.gradingScales || {}),
      },
    }))

    // Persist to backend
    const result = await patchPreferences(newPrefs)
    if (result) {
      setPreferences(result)
      return { success: true, data: result }
    }

    // Rollback on failure
    setPreferences(previousPrefs)
    return { success: false, error: 'Failed to update preferences' }
  }

  /**
   * Load default grading scales
   */
  const loadDefaultScales = async (categories: string[] | null = null): Promise<AuthActionResult<{ data: UserPreferences }>> => {
    const result = await loadDefaultPreferences(categories)
    if (result) {
      setPreferences(result)
      return { success: true, data: result }
    }
    return { success: false, error: 'Failed to load defaults' }
  }

  const updateProfile = async (username: string): Promise<AuthActionResult<{ profile: UserProfile }>> => {
    try {
      const nextUsername = typeof username === 'string' ? username.trim() : ''
      if (nextUsername.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters' }
      }

      const { updateProfile: apiUpdateProfile } = await import('../api')
      const updated = await apiUpdateProfile(nextUsername)
      if (!updated) {
        return { success: false, error: 'Failed to update profile' }
      }

      setProfile(updated)
      lastProfileUserIdRef.current = updated.id
      setProfileError(null)
      return { success: true, profile: updated }
    } catch (err) {
      return { success: false, error: getErrorMessage(err) }
    }
  }

  const value: AuthContextValue = {
    user,
    session,
    loading,
    authReady,
    // Deprecated: cookieReady is an alias for authReady for backward compatibility
    cookieReady: authReady,
    preferences,
    profile,
    profileLoading,
    profileError,
    updatePreferences,
    loadDefaultScales,
    updateProfile,
    login,
    register,
    logout,
    signInWithPhone,
    verifyPhoneOtp,
    resetPassword,
    updatePassword,
  }

  // CRITICAL: Block rendering until auth state is initialized
  // This prevents "flash of unauthenticated content" and race conditions
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Initializing...</p>
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
