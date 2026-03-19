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
  refetchMessages: () => Promise<void>
}

export function useChatRealtime(
  roomId: string | null,
  options?: { initialLimit?: number; userId?: string | null },
): UseChatRealtimeResult {
  const initialLimit = options?.initialLimit ?? 50
  const userId = options?.userId ?? null

  const normalizedRoomId = typeof roomId === 'string' ? roomId.trim() : roomId

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const channelNameRef = useRef<string | null>(null)
  const refetchRef = useRef<() => Promise<void>>(async () => {})
  const connectingRef = useRef(false)
  const channelSerialRef = useRef(0)
  const channelHealthyRef = useRef(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const upsertLocalMessage = (message: ChatMessage) => {
    setMessages((prev) => upsertMessage(prev, message))
  }

  const subscriptionKey = useMemo(() => (normalizedRoomId ? `room:${normalizedRoomId}` : null), [normalizedRoomId])

  const buildRealtimeError = (status: string, err?: { message?: string } | null) => {
    const message = err?.message || ''
    if (message.includes('mismatch between server and client bindings for postgres changes')) {
      return 'Realtime subscription failed due to a Supabase server/client mismatch. Update the Realtime service (or local Supabase stack) to match the client version.'
    }
    return message || `Realtime subscription failed: ${status}`
  }

  useEffect(() => {
    if (import.meta.env.DEV && normalizedRoomId && userId) {
      console.log('Attempting Connection to Room:', normalizedRoomId)
      console.log('Attempting to subscribe to room:', normalizedRoomId)
    }

    if (!supabase) console.error('CRITICAL: Supabase client is NULL')
    let cancelled = false

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }

    const cleanupChannel = () => {
      const ch = channelRef.current
      channelRef.current = null
      channelNameRef.current = null
      channelHealthyRef.current = false
      channelSerialRef.current += 1
      if (ch) {
        try {
          void ch.unsubscribe()
          supabase.removeChannel(ch)
        } catch {
          // ignore cleanup errors
        }
      }
    }

    const fetchMessages = async (reason: 'initial' | 'manual' | 'reconnect' | 'recovery-poll' | 'visibility' | 'online') => {
      if (!normalizedRoomId || !userId) {
        if (!cancelled) {
          setMessages([])
          setLoading(false)
          setError(null)
        }
        return
      }

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

      const nextMessages = (data ?? []).map(asChatMessage).filter((m): m is ChatMessage => Boolean(m))
      if (import.meta.env.DEV) {
        try {
          console.log('[useChatRealtime] initial fetch', { roomId: normalizedRoomId, count: nextMessages.length, reason })
        } catch {}
      }

      if (!cancelled) {
        setMessages(sortMessages(nextMessages))
        if (reason !== 'initial') setError(null)
      }
    }

    const startPolling = () => {
      if (pollIntervalRef.current || cancelled) return
      pollIntervalRef.current = setInterval(() => {
        if (cancelled || channelHealthyRef.current) return
        void fetchMessages('recovery-poll').catch((err) => {
          if (import.meta.env.DEV) console.debug('[useChatRealtime] polling refetch failed', err)
        })
      }, 3000)
    }

    const connectChannel = async () => {
      if (cancelled || !normalizedRoomId || !userId || connectingRef.current) return
      connectingRef.current = true
      cleanupChannel()

      const channelSerial = channelSerialRef.current + 1
      channelSerialRef.current = channelSerial

      const suffix = Math.random().toString(36).slice(2, 8)
      const channelName = `${subscriptionKey || `room:${normalizedRoomId}`}:${userId || 'anon'}:${suffix}`
      channelNameRef.current = channelName

      const channel = supabase.channel(channelName)
      channelRef.current = channel

      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${normalizedRoomId}` },
        (payload: MessagesInsertPayload) => {
          if (channelSerialRef.current !== channelSerial) return
          if (!normalizedRoomId) return
          const incomingRoomId = (payload.new as Record<string, unknown> | null | undefined)?.['room_id']
          if (typeof incomingRoomId === 'string' && incomingRoomId !== normalizedRoomId) return
          if (!payload.new) return

          const normalized = asChatMessage(payload.new)
          if (!normalized) return
          if (import.meta.env.DEV) {
            try {
              console.log('[useChatRealtime] INSERT event', { roomId: normalizedRoomId, messageId: normalized.id })
            } catch {}
          }
          setMessages((prev) => upsertMessage(prev, normalized))
        },
      )

      channel.subscribe((status, err) => {
        if (channelSerialRef.current !== channelSerial || cancelled) return
        if (import.meta.env.DEV) {
          console.log('SUBSCRIPTION STATUS:', status)
          if (err) console.error('SUBSCRIPTION ERROR:', err)
        }

        if (status === 'SUBSCRIBED') {
          channelHealthyRef.current = true
          connectingRef.current = false
          stopPolling()
          setError(null)
          if (import.meta.env.DEV) console.log('[useChatRealtime] SUBSCRIBED', { roomId: normalizedRoomId, channel: channelName })
          return
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelHealthyRef.current = false
          connectingRef.current = false
          setError(buildRealtimeError(status, err ?? null))
          startPolling()
          void fetchMessages('reconnect').catch((fetchErr) => {
            if (import.meta.env.DEV) console.debug('[useChatRealtime] reconnect refetch failed', fetchErr)
          })
          void connectChannel()
        }
      })

      connectingRef.current = false
    }

    async function run(): Promise<void> {
      if (!normalizedRoomId || !userId) {
        stopPolling()
        cleanupChannel()
        setMessages([])
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)
      setMessages([])

      try {
        await fetchMessages('initial')
        await connectChannel()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!cancelled) setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    refetchRef.current = async () => {
      await fetchMessages('manual').catch((err) => {
        if (import.meta.env.DEV) console.debug('[useChatRealtime] manual refetch failed', err)
      })
    }

    const handleWindowRecovery = () => {
      if (!normalizedRoomId || !userId) return
      void fetchMessages('visibility').catch((err) => {
        if (import.meta.env.DEV) console.debug('[useChatRealtime] visibility refetch failed', err)
      })
      if (!channelHealthyRef.current) {
        void connectChannel()
      }
    }

    const handleOnline = () => {
      if (!normalizedRoomId || !userId) return
      void fetchMessages('online').catch((err) => {
        if (import.meta.env.DEV) console.debug('[useChatRealtime] online refetch failed', err)
      })
      if (!channelHealthyRef.current) {
        void connectChannel()
      }
    }

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleWindowRecovery()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleWindowRecovery)
      window.addEventListener('online', handleOnline)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    run()

    return () => {
      cancelled = true
      stopPolling()
      cleanupChannel()
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleWindowRecovery)
        window.removeEventListener('online', handleOnline)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [roomId, normalizedRoomId, initialLimit, subscriptionKey, userId])

  return { messages, loading, error, upsertLocalMessage, refetchMessages: () => refetchRef.current() }
}
