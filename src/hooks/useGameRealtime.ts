import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

type MovePayload = RealtimePostgresChangesPayload<{ [key: string]: unknown }>
const REALTIME_FALLBACK_POLL_MS = 60_000

export function useGameRealtime(
  gameId: string | null,
  refreshToken = 0,
  onGameUpdate?: () => void,
) {
  const [moves, setMoves] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const onGameUpdateRef = useRef(onGameUpdate)
  onGameUpdateRef.current = onGameUpdate
  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const refetchRef = useRef<() => void>(() => {})
  const reconnectAttemptRef = useRef(0)
  const connectingRef = useRef(false)
  const channelSerialRef = useRef(0)
  const channelStatusRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const logDebug = (...args: unknown[]) => {
      if (import.meta.env.DEV) {
        console.debug('[useGameRealtime]', ...args)
      }
    }

    const clearReconnectTimer = () => {
      if (!reconnectTimerRef.current) return
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    const clearPollTimer = () => {
      if (!pollTimerRef.current) return
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    const ensureFallbackPolling = () => {
      if (cancelled || !gameId || pollTimerRef.current) return
      if (channelStatusRef.current === 'SUBSCRIBED') return
      logDebug('fallback polling enabled', { gameId, intervalMs: REALTIME_FALLBACK_POLL_MS })
      pollTimerRef.current = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          return
        }
        void fetchMoves('fallback-poll')
      }, REALTIME_FALLBACK_POLL_MS)
    }

    const cleanupChannel = () => {
      const ch = channelRef.current
      channelRef.current = null
      channelSerialRef.current += 1
      if (ch) {
        try {
          void ch.unsubscribe()
          supabase.removeChannel(ch)
        } catch {
          // ignore
        }
      }
    }

    const fetchMoves = async (reason = 'manual') => {
      if (!gameId) return
      const { data, error } = await supabase
        .from('chess_moves')
        .select('*')
        .eq('game_id', gameId)
        .order('ply', { ascending: true })

      if (cancelled) return
      if (error) {
        logDebug('fetch error', { gameId, reason, message: error.message })
        return
      }

      const fetched = (data ?? []) as any[]
      logDebug('fetch success', { gameId, reason, count: fetched.length })

      // Guard: never replace a populated move list with an empty result from a
      // refetch.  An empty result when we already have moves almost certainly
      // indicates a transient auth / JWT-refresh / RLS issue.
      setMoves(prev => {
        if (prev.length > 0 && fetched.length === 0 && reason !== 'initial') {
          logDebug('fetch IGNORED: refusing to overwrite populated moves with empty result', {
            gameId, reason, prevCount: prev.length,
          })
          return prev
        }
        return fetched
      })
    }

    const scheduleReconnect = () => {
      if (cancelled || !gameId || reconnectTimerRef.current || connectingRef.current) return
      const attempt = reconnectAttemptRef.current
      const delayMs = Math.min(1000 * (2 ** attempt), 8000)
      reconnectAttemptRef.current = Math.min(attempt + 1, 4)
      logDebug('schedule reconnect', { gameId, attempt: attempt + 1, delayMs })
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        void connectChannel()
      }, delayMs)
    }

    const connectChannel = async () => {
      if (cancelled || !gameId || connectingRef.current) return
      connectingRef.current = true
      cleanupChannel()
      const channelSerial = channelSerialRef.current + 1
      channelSerialRef.current = channelSerial

      const channelName = `game:${gameId}:${Math.random().toString(36).slice(2,8)}`
      const channel = supabase.channel(channelName)
      channelRef.current = channel

      logDebug('channel connect', { channelName, gameId })

      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chess_moves', filter: `game_id=eq.${gameId}` },
        (payload: MovePayload) => {
          if (channelSerialRef.current !== channelSerial) return
          if (!payload.new) return
          logDebug('event INSERT', { gameId, payload: payload.new })
          setMoves((prev) => {
            const inserted = payload.new as any
            const insertedId = String(inserted.id ?? '')

            // Prefer authoritative PK-based dedupe. If the realtime payload
            // does not include an `id`, re-sync from the server rather than
            // attempting a brittle `ply`-based replacement which can mask
            // restart/reconcile races.
            if (!insertedId) {
              void fetchMoves()
              return prev
            }

            const next = prev.slice()
            const existingIndex = next.findIndex((move) => String(move.id ?? '') === insertedId)

            if (existingIndex >= 0) {
              next[existingIndex] = inserted
            } else {
              // Binary-search sorted insert by ply to avoid full re-sort
              const insertPly = Number(inserted.ply ?? 0)
              let lo = 0
              let hi = next.length
              while (lo < hi) {
                const mid = (lo + hi) >>> 1
                if ((next[mid].ply || 0) < insertPly) lo = mid + 1
                else hi = mid
              }
              next.splice(lo, 0, inserted)
            }

            return next
          })
        }
      )
      channel.on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chess_moves', filter: `game_id=eq.${gameId}` },
        (payload: MovePayload) => {
          if (channelSerialRef.current !== channelSerial) return
          if (!payload.old) return
          logDebug('event DELETE', { gameId, payload: payload.old })
          const deletedOld = payload.old as Record<string, unknown>
          const deletedId = String(deletedOld.id ?? '')
          const deletedPly = Number(deletedOld.ply ?? -1)
          setMoves((prev) => prev.filter((move) => {
            if (deletedId && String(move.id ?? '') === deletedId) return false
            if (!deletedId && deletedPly >= 0 && Number(move.ply ?? -1) === deletedPly) return false
            return true
          }))
        }
      )
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chess_moves', filter: `game_id=eq.${gameId}` },
        (payload: MovePayload) => {
          if (channelSerialRef.current !== channelSerial) return
          if (!payload.new) return
          logDebug('event UPDATE chess_moves', { gameId, payload: payload.new })
          setMoves((prev) => {
            const updated = payload.new as any
            const updatedId = String(updated.id ?? '')
            const next = prev.slice()
            const index = updatedId
              ? next.findIndex((move) => String(move.id ?? '') === updatedId)
              : next.findIndex((move) => Number(move.ply ?? -1) === Number(updated.ply ?? -2))

            if (index >= 0) {
              next[index] = updated
            } else {
              // Sorted insert by ply
              const insertPly = Number(updated.ply ?? 0)
              let lo = 0
              let hi = next.length
              while (lo < hi) {
                const mid = (lo + hi) >>> 1
                if ((next[mid].ply || 0) < insertPly) lo = mid + 1
                else hi = mid
              }
              next.splice(lo, 0, updated)
            }

            return next
          })
        }
      )
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => {
          if (channelSerialRef.current !== channelSerial) return
          logDebug('event UPDATE games', { gameId })
          void fetchMoves('games-update')
          // Notify caller so they can refresh game state (current_fen, status, etc.)
          onGameUpdateRef.current?.()
        }
      )

      channel.subscribe((status, err) => {
        if (channelSerialRef.current !== channelSerial) return
        channelStatusRef.current = status
        logDebug('channel status', { gameId, status, err: err?.message })
        if (status === 'SUBSCRIBED') {
          clearPollTimer()
          reconnectAttemptRef.current = 0
          connectingRef.current = false
          void fetchMoves('subscribed')
          return
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !cancelled) {
          ensureFallbackPolling()
          connectingRef.current = false
          scheduleReconnect()
        }
      })

      connectingRef.current = false
    }

    // Expose fetchMoves for imperative callers (e.g. after makeMove)
    refetchRef.current = () => { void fetchMoves('refetch') }

    async function run() {
      if (!gameId) {
        setMoves([])
        setLoading(false)
        return
      }
      clearReconnectTimer()
      clearPollTimer()
      reconnectAttemptRef.current = 0
      connectingRef.current = false
      channelStatusRef.current = null
      setLoading(true)
      await fetchMoves('initial')
      if (!cancelled) setLoading(false)
      await connectChannel()
    }

    run()

    return () => {
      cancelled = true
      clearReconnectTimer()
      clearPollTimer()
      cleanupChannel()
    }
  }, [gameId, refreshToken])

  const refetch = useRef(() => { refetchRef.current() })
  return { moves, loading, refetch: refetch.current }
}
