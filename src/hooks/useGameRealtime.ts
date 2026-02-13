import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

type MovePayload = RealtimePostgresChangesPayload<{ [key: string]: unknown }>

export function useGameRealtime(gameId: string | null, refreshToken = 0) {
  const [moves, setMoves] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const connectingRef = useRef(false)
  const channelSerialRef = useRef(0)

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
      } else {
        logDebug('fetch success', { gameId, reason, count: (data ?? []).length })
        setMoves((data ?? []) as any[])
      }
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
        }
      )

      channel.subscribe((status, err) => {
        if (channelSerialRef.current !== channelSerial) return
        logDebug('channel status', { gameId, status, err: err?.message })
        if (status === 'SUBSCRIBED') {
          reconnectAttemptRef.current = 0
          connectingRef.current = false
          void fetchMoves('subscribed')
          return
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !cancelled) {
          connectingRef.current = false
          scheduleReconnect()
        }
      })

      connectingRef.current = false
    }

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
      setLoading(true)
      await fetchMoves('initial')
      if (!cancelled) setLoading(false)
      await connectChannel()

      pollTimerRef.current = setInterval(() => {
        void fetchMoves('interval')
      }, 3000)
    }

    run()

    return () => {
      cancelled = true
      clearReconnectTimer()
      clearPollTimer()
      cleanupChannel()
    }
  }, [gameId, refreshToken])

  return { moves, loading }
}
