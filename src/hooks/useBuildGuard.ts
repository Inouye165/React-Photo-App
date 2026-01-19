import { useEffect, useRef } from 'react'
import { buildApiUrl } from '../config/apiConfig'
import { useAuth } from '../contexts/AuthContext'
import { setAuthToken } from '../api'
import useStore from '../store'

export const BUILD_GUARD_STORAGE_KEY = 'build_guard_forced_at'
export const BUILD_GUARD_THROTTLE_MS = 30_000
export const BUILD_GUARD_INTERVAL_MS = 120_000

export type BuildGuardMismatchResult = 'reloaded' | 'throttled'
export type BuildGuardCheckResult = 'ok' | 'reloaded' | 'throttled' | 'error'

export function getClientBuildId(): string {
  try {
    return import.meta.env.VITE_BUILD_ID || 'dev'
  } catch {
    return 'dev'
  }
}

export async function fetchServerBuildId(
  buildMetaUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(buildMetaUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    })

    if (!response.ok) return null

    const data = (await response.json()) as { buildId?: unknown }
    if (!data || typeof data.buildId !== 'string') return null

    return data.buildId
  } catch {
    return null
  }
}

export function isBuildGuardThrottled(
  storage: Storage,
  nowMs: number,
  throttleMs: number = BUILD_GUARD_THROTTLE_MS,
): boolean {
  const raw = storage.getItem(BUILD_GUARD_STORAGE_KEY)
  const last = raw ? Number(raw) : 0
  if (!Number.isFinite(last) || last <= 0) return false
  return nowMs - last < throttleMs
}

export async function handleBuildMismatch(options: {
  logout?: () => Promise<void>
  clearAuthState?: () => void
  logoutEndpoint: string
  fetcher?: typeof fetch
  storage?: Storage
  now?: () => number
  throttleMs?: number
  reload?: () => void
}): Promise<BuildGuardMismatchResult> {
  const {
    logout,
    clearAuthState,
    logoutEndpoint,
    fetcher = fetch,
    storage = window.sessionStorage,
    now = () => Date.now(),
    throttleMs = BUILD_GUARD_THROTTLE_MS,
    reload = () => window.location.replace(window.location.href),
  } = options

  const nowMs = now()
  if (isBuildGuardThrottled(storage, nowMs, throttleMs)) {
    return 'throttled'
  }

  try {
    storage.setItem(BUILD_GUARD_STORAGE_KEY, String(nowMs))
  } catch {
    // ignore storage failures
  }

  try {
    await fetcher(logoutEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    })
  } catch {
    // ignore logout endpoint failure
  }

  try {
    if (logout) {
      await logout()
    }
  } catch {
    // ignore logout failure
  } finally {
    try {
      clearAuthState?.()
    } catch {
      // ignore auth cleanup failures
    }
  }

  try {
    reload()
  } catch {
    // ignore reload errors
  }

  return 'reloaded'
}

export async function checkBuildIdOnce(options: {
  clientBuildId: string
  buildMetaUrl: string
  handleMismatch: () => Promise<BuildGuardMismatchResult>
  fetcher?: typeof fetch
}): Promise<BuildGuardCheckResult> {
  const { clientBuildId, buildMetaUrl, handleMismatch, fetcher = fetch } = options

  const serverBuildId = await fetchServerBuildId(buildMetaUrl, fetcher)
  if (!serverBuildId) return 'error'

  if (serverBuildId === clientBuildId) return 'ok'

  return handleMismatch()
}

export default function useBuildGuard(): void {
  const { logout } = useAuth()
  const isCheckingRef = useRef(false)
  const hasReloadedRef = useRef(false)

  useEffect(() => {
    const buildMetaUrl = buildApiUrl('/api/meta')
    const logoutEndpoint = buildApiUrl('/api/auth/logout')
    const clientBuildId = getClientBuildId()

    const clearAuthState = () => {
      setAuthToken(null)
      try {
        useStore.getState().setPhotos([])
      } catch {
        // ignore store cleanup failures
      }
    }

    const runCheck = async () => {
      if (isCheckingRef.current || hasReloadedRef.current) return
      isCheckingRef.current = true

      const result = await checkBuildIdOnce({
        clientBuildId,
        buildMetaUrl,
        fetcher: fetch,
        handleMismatch: () =>
          handleBuildMismatch({
            logout,
            clearAuthState,
            logoutEndpoint,
          }),
      })

      if (result === 'reloaded') {
        hasReloadedRef.current = true
      }

      isCheckingRef.current = false
    }

    const handleFocus = () => {
      void runCheck()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runCheck()
      }
    }

    void runCheck()

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const intervalId = window.setInterval(() => {
      void runCheck()
    }, BUILD_GUARD_INTERVAL_MS)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [logout])
}
