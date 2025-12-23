import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export interface UseUnreadMessagesResult {
  unreadCount: number
  hasUnread: boolean
  loading: boolean
  markAllAsRead: () => void
}

/**
 * Hook to track unread messages across all rooms for the current user.
 * Checks for messages created after the user's last login time.
 */
export function useUnreadMessages(userId: string | null | undefined): UseUnreadMessagesResult {
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [lastCheckTime, setLastCheckTime] = useState<string>(new Date().toISOString())

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0)
      setLoading(false)
      return
    }

    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function fetchUnreadCount(): Promise<void> {
      try {
        setLoading(true)

        // Get all rooms the user is a member of
        const { data: roomMemberships, error: roomError } = await supabase
          .from('room_members')
          .select('room_id')
          .eq('user_id', userId)

        if (roomError) throw roomError
        if (!roomMemberships || roomMemberships.length === 0) {
          if (!cancelled) {
            setUnreadCount(0)
            setLoading(false)
          }
          return
        }

        const roomIds = roomMemberships.map((m) => m.room_id)

        // Count messages in those rooms that are newer than lastCheckTime
        // and not sent by the current user
        const { count, error: countError } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('room_id', roomIds)
          .neq('sender_id', userId)
          .gt('created_at', lastCheckTime)

        if (countError) throw countError

        if (!cancelled) {
          setUnreadCount(count ?? 0)
          setLoading(false)
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.debug('[useUnreadMessages] Error fetching unread count:', err)
        }
        if (!cancelled) {
          setUnreadCount(0)
          setLoading(false)
        }
      }
    }

    // Initial fetch
    fetchUnreadCount()

    // Subscribe to new messages in real-time
    const channelName = `unread-messages:${userId}`
    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          // Only count if message is not from current user
          const newMessage = payload.new as { sender_id?: string; created_at?: string }
          if (newMessage.sender_id !== userId && newMessage.created_at && newMessage.created_at > lastCheckTime) {
            setUnreadCount((prev) => prev + 1)
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [userId, lastCheckTime])

  const markAllAsRead = () => {
    setLastCheckTime(new Date().toISOString())
    setUnreadCount(0)
  }

  return {
    unreadCount,
    hasUnread: unreadCount > 0,
    loading,
    markAllAsRead,
  }
}
