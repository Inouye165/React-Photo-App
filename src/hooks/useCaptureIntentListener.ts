import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { consumeCaptureIntent, getOpenCaptureIntent } from '../api'
import { isProbablyMobile } from '../utils/isProbablyMobile'
import type { CaptureIntent } from '../api/captureIntents'

const INTENT_EVENT_NAME = 'capture-intent'
const POLL_INTERVAL_MS = 12_000

function buildCaptureUrl(intent: CaptureIntent) {
  const params = new URLSearchParams()
  params.set('capture', '1')
  if (intent.collectibleId !== null && intent.collectibleId !== undefined) {
    params.set('collectibleId', String(intent.collectibleId))
  }
  return `/photos/${intent.photoId}/edit?${params.toString()}`
}

export function useCaptureIntentListener(params: { enabled: boolean }) {
  const enabled = Boolean(params?.enabled)
  const navigate = useNavigate()
  const lastHandledIdRef = useRef<string | null>(null)
  const handlingRef = useRef(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (!isProbablyMobile()) return

    let mounted = true

    const markHandled = (intentId: string) => {
      lastHandledIdRef.current = intentId
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('capture-intent:last-handled', intentId)
        }
      } catch {
        // ignore storage errors
      }
    }

    const wasHandled = (intentId: string) => {
      if (!intentId) return false
      if (lastHandledIdRef.current === intentId) return true
      try {
        if (typeof sessionStorage !== 'undefined') {
          const stored = sessionStorage.getItem('capture-intent:last-handled')
          if (stored && stored === intentId) {
            lastHandledIdRef.current = stored
            return true
          }
        }
      } catch {
        // ignore storage errors
      }
      return false
    }

    const handleIntent = async (intent: CaptureIntent | null, source: 'poll' | 'sse' | 'initial') => {
      if (!mounted || !intent || !intent.id) return
      if (handlingRef.current) return
      if (wasHandled(intent.id)) return

      handlingRef.current = true
      markHandled(intent.id)

      try {
        const targetUrl = buildCaptureUrl(intent)
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
        const targetPath = `/photos/${intent.photoId}/edit`

        if (currentPath === targetPath) {
          navigate(targetUrl, { replace: true })
        } else {
          navigate(targetUrl)
        }
      } finally {
        try {
          await consumeCaptureIntent(intent.id)
        } catch {
          // ignore consume errors to avoid blocking UX
        }
        handlingRef.current = false
      }

      void source
    }

    const checkOnce = async (source: 'poll' | 'initial') => {
      if (!mounted) return
      if (handlingRef.current) return
      try {
        const intent = await getOpenCaptureIntent()
        if (!mounted) return
        await handleIntent(intent, source)
      } catch {
        // ignore network errors
      }
    }

    const handleEvent = (event: Event) => {
      const custom = event as CustomEvent
      const detail = custom?.detail as CaptureIntent | undefined
      if (!detail) return
      void handleIntent(detail, 'sse')
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkOnce('poll')
      }
    }

    window.addEventListener(INTENT_EVENT_NAME, handleEvent)
    document.addEventListener('visibilitychange', handleVisibility)

    void checkOnce('initial')

    pollTimerRef.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void checkOnce('poll')
    }, POLL_INTERVAL_MS)

    return () => {
      mounted = false
      window.removeEventListener(INTENT_EVENT_NAME, handleEvent)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [enabled, navigate])
}
