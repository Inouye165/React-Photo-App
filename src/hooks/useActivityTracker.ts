import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { logActivity } from '../api/activity'
import type { ActivityAction } from '../api/activity'

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000 // 1 hour

// Events that count as "user activity"
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'pointermove',
]

/**
 * Map pathname prefixes to the page_view metadata.page value we log.
 * Returns null for pages we don't need to track.
 */
function classifyPage(pathname: string): string | null {
  if (pathname.startsWith('/gallery')) return 'gallery'
  if (pathname.startsWith('/chat')) return 'messages'
  if (pathname.startsWith('/games')) return 'games'
  return null
}

export type UseActivityTrackerOptions = {
  /** Whether the user is authenticated. When false the tracker is disabled. */
  isAuthenticated: boolean
  /** Called when the inactivity timeout fires. Should invoke logout. */
  onInactivityLogout: () => void | Promise<void>
}

/**
 * Hook that:
 * 1. Logs page_view events when the user navigates to gallery / messages / games.
 * 2. Monitors user activity and triggers auto-logout after 1 hour of inactivity.
 *
 * Activity actions like sign_in, password_change, username_set, game_played,
 * and message_sent are logged explicitly at their call-sites via `logActivity()`.
 */
export function useActivityTracker({
  isAuthenticated,
  onInactivityLogout,
}: UseActivityTrackerOptions): void {
  const location = useLocation()
  const lastLoggedPage = useRef<string | null>(null)
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLoggedOut = useRef(false)

  // ---- page_view tracking ----
  useEffect(() => {
    if (!isAuthenticated) return

    const page = classifyPage(location.pathname)
    if (page && page !== lastLoggedPage.current) {
      lastLoggedPage.current = page
      logActivity('page_view', { page })
    }
  }, [location.pathname, isAuthenticated])

  // ---- inactivity auto-logout ----
  const resetTimer = useCallback(() => {
    if (!isAuthenticated || isLoggedOut.current) return

    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current)
    }

    inactivityTimer.current = setTimeout(async () => {
      if (isLoggedOut.current) return
      isLoggedOut.current = true

      // Best-effort log before logging out
      await logActivity('auto_logout_inactive', {
        reason: 'No activity for 1 hour',
      })

      onInactivityLogout()
    }, INACTIVITY_TIMEOUT_MS)
  }, [isAuthenticated, onInactivityLogout])

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear timer when not authenticated
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current)
        inactivityTimer.current = null
      }
      isLoggedOut.current = false
      return
    }

    // Start the timer and attach event listeners
    resetTimer()

    const handler = () => resetTimer()

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handler, { passive: true })
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handler)
      }
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current)
        inactivityTimer.current = null
      }
    }
  }, [isAuthenticated, resetTimer])
}

/**
 * Convenience re-export so call-sites can import logActivity from the hook file.
 */
export { logActivity }
export type { ActivityAction }
