import { useEffect, useRef, useState } from 'react'
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
  // Track which room messages are currently loaded for — only wipe on room change
  const loadedRoomIdRef = useRef<string | null>(null)
  const effectRunRef = useRef(0)

  const upsertLocalMessage = (message: ChatMessage) => {
    console.log('[useChatRealtime][upsertLocalMessage] inserting id=', message.id, 'content=', message.content?.substring(0, 30))
    setMessages((prev) => {
      const next = upsertMessage(prev, message)
      console.log('[useChatRealtime][upsertLocalMessage] prev.len=', prev.length, '→ next.len=', next.length)
      return next
    })
  }

  const buildRealtimeError = (status: string, err?: { message?: string } | null) => {
    const message = err?.message || ''
    if (message.includes('mismatch between server and client bindings for postgres changes')) {
      return 'Realtime subscription failed due to a Supabase server/client mismatch. Update the Realtime service (or local Supabase stack) to match the client version.'
    }
    return message || `Realtime subscription failed: ${status}`
  }

  useEffect(() => {
    const runId = ++effectRunRef.current
    console.log(`[useChatRealtime][effect#${runId}] START roomId=${normalizedRoomId} userId=${userId} loadedRoom=${loadedRoomIdRef.current}`)

    if (!supabase) console.error('CRITICAL: Supabase client is NULL')
    let cancelled = false

    const lastSubscriptionStatusRef: { current: string | null } = { current: null }

    async function run(): Promise<void> {
      if (!normalizedRoomId || !userId) {
        console.log(`[useChatRealtime][effect#${runId}] EARLY EXIT — no roomId or userId (roomId=${normalizedRoomId} userId=${userId})`)
        if (loadedRoomIdRef.current !== null) {
          console.log(`[useChatRealtime][effect#${runId}] WIPING messages (no room/user)`)
          loadedRoomIdRef.current = null
          setMessages([])
        }
        setLoading(false)
        setError(null)
        return
      }

      const roomChanged = loadedRoomIdRef.current !== normalizedRoomId
      console.log(`[useChatRealtime][effect#${runId}] roomChanged=${roomChanged} (was ${loadedRoomIdRef.current} → now ${normalizedRoomId})`)

      setLoading(true)
      setError(null)
      if (roomChanged) {
        console.log(`[useChatRealtime][effect#${runId}] WIPING messages for room change`)
        loadedRoomIdRef.current = normalizedRoomId
        setMessages([])
      }

      try {
        console.log(`[useChatRealtime][effect#${runId}] FETCHING messages from DB room=${normalizedRoomId}`)
        const { data, error: fetchError } = await supabase
          .from('messages')
          .select('id, room_id, sender_id, content, photo_id, created_at')
          .eq('room_id', normalizedRoomId)
          .order('created_at', { ascending: true })
          .limit(initialLimit)

        console.log(`[useChatRealtime][effect#${runId}] FETCH result: error=${fetchError?.message ?? 'none'} rowCount=${data?.length ?? 'null'} cancelled=${cancelled}`)
        if (data) console.log(`[useChatRealtime][effect#${runId}] FETCH rows:`, data.map((r: Record<string,unknown>) => ({ id: r['id'], content: String(r['content'] ?? '').substring(0,20) })))

        if (fetchError) throw fetchError

        const initial = (data ?? []).map(asChatMessage).filter((m): m is ChatMessage => Boolean(m))
        console.log(`[useChatRealtime][effect#${runId}] MAPPED ${initial.length} messages, cancelled=${cancelled}`)

        if (!cancelled) {
          setMessages((prev) => {
            const merged = [...initial]
            for (const p of prev) {
              if (!merged.find((m) => m.id === p.id)) merged.push(p)
            }
            const sorted = sortMessages(merged)
            console.log(`[useChatRealtime][effect#${runId}] setMessages: prev.len=${prev.length} initial.len=${initial.length} merged.len=${sorted.length}`)
            return sorted
          })
        } else {
          console.log(`[useChatRealtime][effect#${runId}] SKIPPING setMessages — cancelled`)
        }

        if (cancelled) {
          console.log(`[useChatRealtime][effect#${runId}] ABORTED before subscribe — cancelled`)
          return
        }

        // Realtime subscription
        const suffix = Math.random().toString(36).slice(2, 8)
        const channelName = `room:${normalizedRoomId}:${userId || 'anon'}:${suffix}`
        console.log(`[useChatRealtime][effect#${runId}] SUBSCRIBING channel=${channelName}`)
        const channel = supabase.channel(channelName)
        channelRef.current = channel

        channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${normalizedRoomId}` },
          (payload: MessagesInsertPayload) => {
            console.log(`[useChatRealtime][effect#${runId}] REALTIME INSERT received`, payload.new)
            if (!normalizedRoomId) return
            const incomingRoomId = (payload.new as Record<string, unknown> | null | undefined)?.['room_id']
            if (typeof incomingRoomId === 'string' && incomingRoomId !== normalizedRoomId) {
              console.log(`[useChatRealtime][effect#${runId}] REALTIME ignoring — wrong room ${incomingRoomId}`)
              return
            }
            if (!payload.new) return

            const normalized = asChatMessage(payload.new)
            if (!normalized) {
              console.warn(`[useChatRealtime][effect#${runId}] REALTIME asChatMessage returned null`)
              return
            }
            console.log(`[useChatRealtime][effect#${runId}] REALTIME upserting message id=`, normalized.id)
            setMessages((prev) => upsertMessage(prev, normalized))
          },
        )

        channel.subscribe((status, err) => {
          lastSubscriptionStatusRef.current = status
          console.log(`[useChatRealtime][effect#${runId}] SUBSCRIPTION STATUS: ${status}`, err ? `ERR: ${err.message}` : '')
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            console.log('[useChatRealtime] SUBSCRIBED', { roomId: normalizedRoomId, channel: channelName })
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setError(buildRealtimeError(status, err ?? null))
          }
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[useChatRealtime][effect#${runId}] CATCH:`, err)
        if (!cancelled) setError(message)
      } finally {
        if (!cancelled) setLoading(false)
        console.log(`[useChatRealtime][effect#${runId}] DONE cancelled=${cancelled}`)
      }
    }

    run()

    return () => {
      console.log(`[useChatRealtime][effect#${runId}] CLEANUP cancelled=true`)
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
  }, [normalizedRoomId, initialLimit, userId])

  return { messages, loading, error, upsertLocalMessage }
}
