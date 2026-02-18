import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

export interface UseUnreadMessagesResult {
  unreadCount: number
  unreadByRoom: Record<string, number>
  hasUnread: boolean
  loading: boolean
  refresh: () => void
}

type PostgrestLikeError = {
  code?: string | null
  message?: string | null
}

type RoomMembershipRow = {
  room_id: string
  last_read_at?: string | null
}

function isMissingLastReadAtColumnError(error: unknown): boolean {
  const candidate = error as PostgrestLikeError | null
  const code = candidate?.code ?? ''
  const message = (candidate?.message ?? '').toLowerCase()
  return code === '42703' || message.includes('last_read_at')
}

/**
 * Hook to track unread messages across all rooms for the current user.
 * Uses persistent last_read_at from room_members table.
 */
export function useUnreadMessages(userId: string | null | undefined): UseUnreadMessagesResult {
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [trigger, setTrigger] = useState(0)
  const warnedMissingColumnRef = useRef(false)

  const refresh = useCallback(() => {
    setTrigger((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0)
      setUnreadByRoom({})
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchUnreadCount() {
      try {
        setLoading(true)

        // 1. Get all rooms and their last_read_at for this user
        const { data: membershipsRaw, error: memError } = await supabase
          .from('room_members')
          .select('room_id, last_read_at')
          .eq('user_id', userId)

        let memberships = (membershipsRaw ?? []) as RoomMembershipRow[]
        let supportsLastReadAt = true

        if (memError) {
          if (isMissingLastReadAtColumnError(memError)) {
            supportsLastReadAt = false
            const { data: fallbackMemberships, error: fallbackError } = await supabase
              .from('room_members')
              .select('room_id')
              .eq('user_id', userId)

            if (fallbackError) throw fallbackError
            memberships = (fallbackMemberships ?? []) as RoomMembershipRow[]

            if (import.meta.env.DEV && !warnedMissingColumnRef.current) {
              warnedMissingColumnRef.current = true
              console.warn('[useUnreadMessages] room_members.last_read_at is missing. Returning unread=0 until migration is applied.')
            }
          } else {
            throw memError
          }
        }

        if (!memberships || memberships.length === 0) {
          if (!cancelled) {
            setUnreadCount(0)
            setUnreadByRoom({})
            setLoading(false)
          }
          return
        }

        if (!supportsLastReadAt) {
          if (!cancelled) {
            setUnreadCount(0)
            setUnreadByRoom({})
            setLoading(false)
          }
          return
        }

        // 2. Find the oldest last_read_at to minimize the query range
        const timestamps = memberships.map((m) => new Date(m.last_read_at ?? 0).getTime())
        const minTimestamp = Math.min(...timestamps)
        const minDateISO = new Date(minTimestamp).toISOString()
        const roomIds = memberships.map((m) => m.room_id)

        // 3. Fetch potential unread messages
        // We only care about messages from other users.
        const { data: messages, error: msgError } = await supabase
          .from('messages')
          .select('room_id, created_at')
          .in('room_id', roomIds)
          .neq('sender_id', userId)
          .gt('created_at', minDateISO)

        if (msgError) throw msgError

        // 4. Filter and count per room
        const byRoom = new Map<string, number>()
        const lastReadMap = new Map(memberships.map((m) => [m.room_id, new Date(m.last_read_at ?? 0).getTime()]))

        messages?.forEach((msg) => {
          const msgTime = new Date(msg.created_at).getTime()
          const readTime = lastReadMap.get(msg.room_id) ?? 0
          if (msgTime > readTime) {
            byRoom.set(msg.room_id, (byRoom.get(msg.room_id) ?? 0) + 1)
          }
        })

        const unreadByRoomRecord: Record<string, number> = {}
        for (const [roomId, count] of byRoom.entries()) {
          unreadByRoomRecord[roomId] = count
        }

        // Ensure we only expose rooms the user belongs to (defense-in-depth)
        // and ensure rooms with 0 unread are omitted.
        const allowedRoomIds = new Set(memberships.map((m) => m.room_id))
        for (const roomId of Object.keys(unreadByRoomRecord)) {
          if (!allowedRoomIds.has(roomId)) {
            delete unreadByRoomRecord[roomId]
          }
        }

        const totalUnread = Object.values(unreadByRoomRecord).reduce((sum, n) => sum + n, 0)

        if (!cancelled) {
          setUnreadByRoom(unreadByRoomRecord)
          setUnreadCount(totalUnread)
          setLoading(false)
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[useUnreadMessages] Error:', err)
        }
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchUnreadCount()

    // Subscribe to changes
    const channel = supabase
      .channel(`unread-tracking:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as { room_id: string; sender_id: string; created_at: string }
          if (newMsg.sender_id !== userId) {
            refresh()
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refresh()
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId, trigger, refresh])

  return {
    unreadCount,
    unreadByRoom,
    hasUnread: unreadCount > 0,
    loading,
    refresh,
  }
}
