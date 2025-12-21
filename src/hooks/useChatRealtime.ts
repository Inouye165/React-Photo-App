import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import { supabase } from '../supabaseClient'
import type { ChatMessage } from '../types/chat'
import { asChatMessage, sortMessages, upsertMessage } from '../utils/chatUtils'

type MessagesInsertPayload = RealtimePostgresChangesPayload<{ [key: string]: unknown }>

export interface UseChatRealtimeResult {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  upsertLocalMessage: (message: ChatMessage) => void
}

export function useChatRealtime(roomId: string | null, options?: { initialLimit?: number }): UseChatRealtimeResult {
  const initialLimit = options?.initialLimit ?? 50

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)

  const upsertLocalMessage = (message: ChatMessage) => {
    setMessages((prev) => upsertMessage(prev, message))
  }

  const subscriptionKey = useMemo(() => (roomId ? `room:${roomId}` : null), [roomId])

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      if (!roomId) {
        setMessages([])
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)
      setMessages([])

      try {
        // Initial fetch
        const { data, error: fetchError } = await supabase
          .from('messages')
          .select('id, room_id, sender_id, content, photo_id, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true })
          .limit(initialLimit)

        if (fetchError) throw fetchError

        const initial = (data ?? []).map(asChatMessage).filter((m): m is ChatMessage => Boolean(m))
        if (!cancelled) setMessages(sortMessages(initial))

        // Realtime subscription
        const channelName = subscriptionKey || `room:${roomId}`
        const channel = supabase.channel(channelName)
        channelRef.current = channel

        channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          (payload: MessagesInsertPayload) => {
            if (import.meta.env.DEV) console.log('[Realtime] New Message Received', payload)
            if (!roomId) return
            const incomingRoomId = (payload.new as Record<string, unknown> | null | undefined)?.['room_id']
            if (typeof incomingRoomId === 'string' && incomingRoomId !== roomId) return
            const msg = asChatMessage(payload.new)
            if (!msg) return
            setMessages((prev) => [...prev, msg])
          },
        )

        channel.subscribe((status, err) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            if (import.meta.env.DEV) console.log('[useChatRealtime] SUBSCRIBED', { roomId, channel: channelName })
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setError(err?.message || `Realtime subscription failed: ${status}`)
          }
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!cancelled) setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
      const ch = channelRef.current
      channelRef.current = null
      if (ch) {
        try {
          supabase.removeChannel(ch)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [roomId, initialLimit, subscriptionKey])

  return { messages, loading, error, upsertLocalMessage }
}
