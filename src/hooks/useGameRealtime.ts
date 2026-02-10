import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

type MovePayload = RealtimePostgresChangesPayload<{ [key: string]: unknown }>

export function useGameRealtime(gameId: string | null) {
  const [moves, setMoves] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!gameId) {
        setMoves([])
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, error } = await supabase
        .from('chess_moves')
        .select('*')
        .eq('game_id', gameId)
        .order('ply', { ascending: true })

      if (!cancelled) {
        if (error) {
          setMoves([])
        } else {
          setMoves((data ?? []) as any[])
        }
        setLoading(false)
      }

      const channelName = `game:${gameId}:${Math.random().toString(36).slice(2,8)}`
      const channel = supabase.channel(channelName)
      channelRef.current = channel
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chess_moves', filter: `game_id=eq.${gameId}` },
        (payload: MovePayload) => {
          if (!payload.new) return
          setMoves((prev) => {
            const next = [...prev, payload.new as any]
            next.sort((a, b) => (a.ply || 0) - (b.ply || 0))
            return next
          })
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
  }, [gameId])

  return { moves, loading }
}
