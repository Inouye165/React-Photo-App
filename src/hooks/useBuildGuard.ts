import { useEffect, useRef } from 'react'
import { buildApiUrl } from '../config/apiConfig'
import { useAuth } from '../contexts/AuthContext'
import { setAuthToken } from '../api'
import useStore from '../store'

export const BUILD_GUARD_STORAGE_KEY = 'build_guard_forced_at'
export const BUILD_GUARD_THROTTLE_MS = 30_000
export const BUILD_GUARD_INTERVAL_MS = 120_000

export const SERVER_BOOT_ID_STORAGE_KEY = 'serverBootId:v1'

export type BuildGuardMismatchResult = 'reloaded' | 'throttled'
export type BuildGuardCheckResult = 'ok' | 'reloaded' | 'throttled' | 'error'

function getAccessToken(session: unknown): string | null {
  const token = (session as { access_token?: unknown } | null)?.access_token
  return typeof token === 'string' && token.length > 0 ? token : null
}

export async function fetchServerMeta(
  buildMetaUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<{ buildId: string; bootId: string } | null> {
  try {
    const response = await fetcher(buildMetaUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    })

    if (!response.ok) return null

    const data = (await response.json()) as { buildId?: unknown; bootId?: unknown }
    if (!data || typeof data.buildId !== 'string') return null
    if (typeof data.bootId !== 'string') return null

    return { buildId: data.buildId, bootId: data.bootId }
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
  fetcher?: typeof fetch
  storage?: Storage
  now?: () => number
  throttleMs?: number
  reload?: () => void
  serverBootId: string
}): Promise<BuildGuardMismatchResult> {
  const {
    logout,
    clearAuthState,
    storage = window.sessionStorage,
    now = () => Date.now(),
    throttleMs = BUILD_GUARD_THROTTLE_MS,
    reload = () => window.location.replace(window.location.href),
    serverBootId,
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
    storage.setItem(SERVER_BOOT_ID_STORAGE_KEY, serverBootId)
  } catch {
    // ignore storage failures
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
  buildMetaUrl: string
  handleMismatch: (serverBootId: string) => Promise<BuildGuardMismatchResult>
  fetcher?: typeof fetch
  storage?: Storage
}): Promise<BuildGuardCheckResult> {
  const { buildMetaUrl, handleMismatch, fetcher = fetch, storage = window.sessionStorage } = options

  const meta = await fetchServerMeta(buildMetaUrl, fetcher)
  if (!meta) return 'error'

  const storedBootId = storage.getItem(SERVER_BOOT_ID_STORAGE_KEY)
  if (!storedBootId) {
    try {
      storage.setItem(SERVER_BOOT_ID_STORAGE_KEY, meta.bootId)
    } catch {
      // ignore storage failures
    }
    return 'ok'
  }

  if (storedBootId === meta.bootId) return 'ok'

  return handleMismatch(meta.bootId)
}

export default function useBuildGuard(): void {
  const { logout, session } = useAuth()
  const isCheckingRef = useRef(false)
  const hasReloadedRef = useRef(false)

  useEffect(() => {
    const buildMetaUrl = buildApiUrl('/api/meta')

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

      // If the user isn't authenticated, don't store or compare boot ids.
      if (!getAccessToken(session)) return

      isCheckingRef.current = true

      const result = await checkBuildIdOnce({
        buildMetaUrl,
        fetcher: fetch,
        storage: window.sessionStorage,
        handleMismatch: (serverBootId) =>
          handleBuildMismatch({
            logout,
            clearAuthState,
            serverBootId,
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
  }, [logout, session])
}
