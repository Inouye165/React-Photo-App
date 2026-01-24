import { useEffect, useMemo, useRef } from 'react'

import useStore from '../store'
import type { Photo } from '../types/photo'
import { API_BASE_URL, getAccessToken } from '../api'
import { connectPhotoSocket, type SocketMessage, type SocketClient } from '../realtime/socketClient'

type PhotoProcessingStatus = 'queued' | 'processing' | 'finished' | 'failed'

type PhotoProcessingPayload = {
  userId?: string
  eventId?: string
  photoId?: string
  status?: PhotoProcessingStatus
  updatedAt?: string
  progress?: number
}

export function isPhotoEventsEnabledByEnv(): boolean {
  try {
    return String(import.meta?.env?.VITE_ENABLE_PHOTO_EVENTS || '').toLowerCase() === 'true'
  } catch {
    return false
  }
}

export function computeReconnectDelayMs(
  attempt: number,
  options: { baseMs?: number; maxMs?: number; jitterRatio?: number; random?: () => number } = {},
): number {
  const baseMs = Number.isFinite(options.baseMs) ? (options.baseMs as number) : 500
  const maxMs = Number.isFinite(options.maxMs) ? (options.maxMs as number) : 30_000
  const jitterRatio = Number.isFinite(options.jitterRatio) ? (options.jitterRatio as number) : 0.2
  const random = typeof options.random === 'function' ? options.random : Math.random

  const exp = Math.max(0, attempt)
  const raw = baseMs * Math.pow(2, Math.min(exp, 10))
  const capped = Math.min(maxMs, Math.max(baseMs, raw))

  // Jitter multiplier in [1-j, 1+j].
  const r = Math.min(1, Math.max(0, random()))
  const mult = 1 + (r * 2 - 1) * jitterRatio

  return Math.max(0, Math.floor(capped * mult))
}

export function createEventDedupe(maxSize = 200) {
  const seen = new Set<string>()
  const order: string[] = []

  return {
    has: (id: string) => seen.has(id),
    add: (id: string) => {
      if (!id) return
      if (seen.has(id)) return
      seen.add(id)
      order.push(id)
      while (order.length > maxSize) {
        const oldest = order.shift()
        if (oldest) seen.delete(oldest)
      }
    },
    size: () => order.length,
  }
}

function parseUpdatedAtToMs(updatedAt: unknown): number | null {
  if (typeof updatedAt !== 'string') return null
  const s = updatedAt.trim()
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function mapStatusToPhotoState(status: PhotoProcessingStatus | undefined): Photo['state'] | undefined {
  if (status === 'finished') return 'finished'
  if (status === 'failed') return 'error'
  if (status === 'queued' || status === 'processing') return 'inprogress'
  return undefined
}

function extractDedupeId(message: SocketMessage, payload: PhotoProcessingPayload | null): string | null {
  const fromMessage = message?.eventId
  if (fromMessage && typeof fromMessage === 'string' && fromMessage.trim()) return fromMessage
  const fromPayload = payload?.eventId
  if (fromPayload && typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload
  return null
}

export type UsePhotoProcessingEventsResult = {
  enabled: boolean
  streaming: boolean
  fallbackToPolling: boolean
}

export function usePhotoProcessingEvents(params: { authed: boolean }): UsePhotoProcessingEventsResult {
  const authed = Boolean(params?.authed)
  const photoEventsEnvEnabled = useMemo(() => isPhotoEventsEnabledByEnv(), [])

  const streamingActive = useStore((s) => s.photoEventsStreamingActive)
  const setStreamingActive = useStore((s) => s.setPhotoEventsStreamingActive)

  const clientRef = useRef<SocketClient | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const failuresRef = useRef(0)
  const dedupeRef = useRef(createEventDedupe(200))
  const lastSeenTimestampMsRef = useRef<number | null>(null)
  const lastSeenEventIdRef = useRef<string | null>(null)

  const enabled = authed && photoEventsEnvEnabled

  useEffect(() => {
    if (!enabled) {
      // Ensure we never leave the store in "streaming" mode if feature is disabled.
      try {
        setStreamingActive(false, 'disabled')
      } catch {
        // ignore
      }
      return
    }

    let mounted = true

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        try {
          clearTimeout(reconnectTimerRef.current)
        } catch {
          // ignore
        }
        reconnectTimerRef.current = null
      }
    }

    const cleanupClient = () => {
      clearReconnectTimer()

      if (clientRef.current) {
        try {
          clientRef.current.close()
        } catch {
          // ignore
        }
        clientRef.current = null
      }

      if (abortRef.current) {
        try {
          abortRef.current.abort()
        } catch {
          // ignore
        }
        abortRef.current = null
      }

      // Do not forcibly flip store flag here; if we are unmounting due to
      // navigation, we should stop streaming and let polling resume on next mount.
      try {
        setStreamingActive(false, 'cleanup')
      } catch {
        // ignore
      }
    }

    const scheduleReconnect = () => {
      clearReconnectTimer()

      const delayMs = computeReconnectDelayMs(failuresRef.current)
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        void start()
      }, delayMs)
    }

    const onMessage = (message: SocketMessage) => {
      if (!message || typeof message !== 'object') return

      if (message.type && message.type !== 'photo.processing') {
        const payload = message.payload

        if (message.type === 'capture.intent') {
          if (payload && typeof payload === 'object') {
            try {
              if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('capture-intent', { detail: payload }))
              }
            } catch {
              // ignore event dispatch errors
            }
          }
          return
        }

        if (message.type === 'collectible.photos.changed') {
          if (payload && typeof payload === 'object') {
            try {
              if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('collectible-photos-changed', { detail: payload }))
              }
            } catch {
              // ignore event dispatch errors
            }
          }
          return
        }

        return
      }

      if (message.eventId && typeof message.eventId === 'string' && message.eventId.trim()) {
        lastSeenEventIdRef.current = message.eventId
      }

      const payload = (message.payload && typeof message.payload === 'object')
        ? (message.payload as PhotoProcessingPayload)
        : null

      // Update last-seen timestamp for resumability before any early returns.
      const ts = parseUpdatedAtToMs(payload?.updatedAt)
      if (ts !== null) {
        lastSeenTimestampMsRef.current = ts
      }

      const dedupeId = extractDedupeId(message, payload)
      if (dedupeId) {
        if (dedupeRef.current.has(dedupeId)) return
        dedupeRef.current.add(dedupeId)
      }

      const photoId = payload?.photoId
      const status = payload?.status
      const nextState = mapStatusToPhotoState(status)

      if (!photoId || !nextState) return

      try {
        useStore.getState().updatePhoto({
          id: photoId,
          state: nextState,
          updated_at: typeof payload?.updatedAt === 'string' ? payload.updatedAt : undefined,
        })
      } catch {
        // ignore local update errors
      }

      if (nextState === 'finished' || nextState === 'error') {
        try {
          useStore.getState().stopAiPolling(photoId, 'sse_terminal_state')
        } catch {
          // ignore
        }
      }
    }

    const start = async () => {
      if (!mounted) return

      // Avoid concurrent streams.
      if (clientRef.current || abortRef.current) return

      const token = getAccessToken()
      if (!token) {
        // Not authenticated yet; try again later without counting as a failure.
        scheduleReconnect()
        return
      }

      const abort = new AbortController()
      abortRef.current = abort

      try {
        const client = await connectPhotoSocket({
          apiBaseUrl: API_BASE_URL,
          token,
          onMessage,
          onError: () => {
            // Do not log token/payload.
          },
          signal: abort.signal,
          since: lastSeenEventIdRef.current ?? lastSeenTimestampMsRef.current ?? undefined,
        })

        if (!mounted) {
          try {
            client.close()
          } catch {
            // ignore
          }
          return
        }

        clientRef.current = client
        failuresRef.current = 0

        // Only pause polling once we have a confirmed SSE stream.
        try {
          setStreamingActive(true, 'connected')
        } catch {
          // ignore
        }

        await client.closed

        // Normal close / disconnect: count as failure and reconnect.
        if (!mounted) return

        clientRef.current = null
        abortRef.current = null
        failuresRef.current += 1
        try {
          setStreamingActive(false, 'disconnected')
        } catch {
          // ignore
        }
        scheduleReconnect()
      } catch (err) {
        if (!mounted) return

        clientRef.current = null
        abortRef.current = null

        failuresRef.current += 1
        try {
          setStreamingActive(false, 'connect_failed')
        } catch {
          // ignore
        }
        scheduleReconnect()
      }
    }

    void start()

    return () => {
      mounted = false
      cleanupClient()
    }
  }, [enabled, setStreamingActive])

  return {
    enabled,
    streaming: Boolean(enabled && streamingActive),
    fallbackToPolling: false,
  }
}
