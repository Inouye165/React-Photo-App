import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

type MovePayload = RealtimePostgresChangesPayload<{ [key: string]: unknown }>

export function useGameRealtime(gameId: string | null, refreshToken = 0) {
  const [moves, setMoves] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchMoves = async () => {
      if (!gameId) return
      const { data, error } = await supabase
        .from('chess_moves')
        .select('*')
        .eq('game_id', gameId)
        .order('ply', { ascending: true })

      if (cancelled) return
      if (error) {
        setMoves([])
      } else {
        setMoves((data ?? []) as any[])
      }
    }

    async function run() {
      if (!gameId) {
        setMoves([])
        setLoading(false)
        return
      }
      setLoading(true)
      await fetchMoves()
      if (!cancelled) setLoading(false)

      const channelName = `game:${gameId}:${Math.random().toString(36).slice(2,8)}`
      const channel = supabase.channel(channelName)
      channelRef.current = channel
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chess_moves', filter: `game_id=eq.${gameId}` },
        (payload: MovePayload) => {
          if (!payload.new) return
          setMoves((prev) => {
            const inserted = payload.new as any
            const insertedId = String(inserted.id ?? '')
            const next = prev.slice()
            const existingIndex = insertedId
              ? next.findIndex((move) => String(move.id ?? '') === insertedId)
              : next.findIndex((move) => Number(move.ply ?? -1) === Number(inserted.ply ?? -2))

            if (existingIndex >= 0) {
              next[existingIndex] = inserted
            } else {
              next.push(inserted)
            }

            next.sort((a, b) => (a.ply || 0) - (b.ply || 0))
            return next
          })
        }
      )
      channel.on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chess_moves', filter: `game_id=eq.${gameId}` },
        (payload: MovePayload) => {
          if (!payload.old) return
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
          if (!payload.new) return
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
              next.push(updated)
            }

            next.sort((a, b) => (a.ply || 0) - (b.ply || 0))
            return next
          })
        }
      )
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => {
          void fetchMoves()
        }
      )

      channel.subscribe((_, err) => {
        if (err && !cancelled) {
          // ignore
        }
      })
    }
    run()

    return () => {
      cancelled = true
      const ch = channelRef.current
      channelRef.current = null
      if (ch) {
        try { void ch.unsubscribe(); supabase.removeChannel(ch) } catch { }
      }
    }
  }, [gameId, refreshToken])

  return { moves, loading }
}
