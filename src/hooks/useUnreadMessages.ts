import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export interface UseUnreadMessagesResult {
  unreadCount: number
  hasUnread: boolean
  loading: boolean
  refresh: () => void
}

/**
 * Hook to track unread messages across all rooms for the current user.
 * Uses persistent last_read_at from room_members table.
 */
export function useUnreadMessages(userId: string | null | undefined): UseUnreadMessagesResult {
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [trigger, setTrigger] = useState(0)

  const refresh = useCallback(() => {
    setTrigger((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0)
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchUnreadCount() {
      try {
        setLoading(true)

        // 1. Get all rooms and their last_read_at for this user
        const { data: memberships, error: memError } = await supabase
          .from('room_members')
          .select('room_id, last_read_at')
          .eq('user_id', userId)

        if (memError) throw memError
        if (!memberships || memberships.length === 0) {
          if (!cancelled) {
            setUnreadCount(0)
            setLoading(false)
          }
          return
        }

        // 2. Find the oldest last_read_at to minimize the query range
        const timestamps = memberships.map((m) => new Date(m.last_read_at).getTime())
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

        // 4. Filter and count
        let count = 0
        const lastReadMap = new Map(memberships.map((m) => [m.room_id, new Date(m.last_read_at).getTime()]))

        messages?.forEach((msg) => {
          const msgTime = new Date(msg.created_at).getTime()
          const readTime = lastReadMap.get(msg.room_id) ?? 0
          if (msgTime > readTime) {
            count++
          }
        })

        if (!cancelled) {
          setUnreadCount(count)
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
          event: 'UPDATE',
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
    hasUnread: unreadCount > 0,
    loading,
    refresh,
  }
}
