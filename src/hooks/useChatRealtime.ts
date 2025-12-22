import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import { supabase } from '../supabaseClient'
import type { ChatMessage } from '../types/chat'
import { asChatMessage, sortMessages, upsertMessage } from '../utils/chatUtils'

console.log('HOOK FILE LOADED')

type MessagesInsertPayload = RealtimePostgresChangesPayload<{ [key: string]: unknown }>

export interface UseChatRealtimeResult {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  upsertLocalMessage: (message: ChatMessage) => void
}

export function useChatRealtime(roomId: string | null, options?: { initialLimit?: number }): UseChatRealtimeResult {
  const initialLimit = options?.initialLimit ?? 50

  const normalizedRoomId = typeof roomId === 'string' ? roomId.trim() : roomId

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)

  const upsertLocalMessage = (message: ChatMessage) => {
    setMessages((prev) => upsertMessage(prev, message))
  }

  const subscriptionKey = useMemo(() => (normalizedRoomId ? `room:${normalizedRoomId}` : null), [normalizedRoomId])

  useEffect(() => {
    console.log('Attempting Connection to Room:', normalizedRoomId)
    if (!supabase) console.error('CRITICAL: Supabase client is NULL')

    if (import.meta.env.DEV) console.log('Attempting to subscribe to room:', normalizedRoomId)
    let cancelled = false

    const lastSubscriptionStatusRef: { current: string | null } = { current: null }

    async function run(): Promise<void> {
      if (!normalizedRoomId) {
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
          .eq('room_id', normalizedRoomId)
          .order('created_at', { ascending: true })
          .limit(initialLimit)

        if (fetchError) throw fetchError

        if (import.meta.env.DEV) {
          const firstRoomId = (data?.[0] as Record<string, unknown> | undefined)?.['room_id']
          if (typeof firstRoomId === 'string' && firstRoomId !== normalizedRoomId) {
            console.warn('[useChatRealtime] Room ID mismatch (URL vs DB)', {
              urlRoomId: normalizedRoomId,
              dbRoomId: firstRoomId,
            })
          }
        }

        const initial = (data ?? []).map(asChatMessage).filter((m): m is ChatMessage => Boolean(m))
        if (!cancelled) setMessages(sortMessages(initial))

        // Realtime subscription
        const channelName = subscriptionKey || `room:${normalizedRoomId}`
        const channel = supabase.channel(channelName)
        channelRef.current = channel

        channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${normalizedRoomId}` },
          (payload: MessagesInsertPayload) => {
            console.log('BROADCAST DETECTED:', (payload.new as Record<string, unknown> | null | undefined) ?? null)
            console.log('RAW REALTIME PAYLOAD:', (payload.new as Record<string, unknown> | null | undefined) ?? null)
            if (import.meta.env.DEV) console.log('[Realtime] New Message Received', payload)
            if (!normalizedRoomId) return
            const incomingRoomId = (payload.new as Record<string, unknown> | null | undefined)?.['room_id']
            if (typeof incomingRoomId === 'string' && incomingRoomId !== normalizedRoomId) return
            if (!payload.new) return
            setMessages((prev) => [...prev, payload.new as unknown as ChatMessage])
          },
        )

        channel.subscribe((status, err) => {
          lastSubscriptionStatusRef.current = status
          console.log('SUBSCRIPTION STATUS:', status)
          if (err) console.error('SUBSCRIPTION ERROR:', err)

          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            if (import.meta.env.DEV) console.log('[useChatRealtime] SUBSCRIBED', { roomId: normalizedRoomId, channel: channelName })
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
          void ch.unsubscribe()
          supabase.removeChannel(ch)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [roomId, normalizedRoomId, initialLimit, subscriptionKey])

  return { messages, loading, error, upsertLocalMessage }
}
