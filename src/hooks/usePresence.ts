import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { supabase } from '../supabaseClient'

export type PresenceStatus = 'idle' | 'connecting' | 'online' | 'error'

export interface UsePresenceResult {
  status: PresenceStatus
  error: string | null
  onlineUserIds: Set<string>
  isUserOnline: (userId: string | null | undefined) => boolean
}

type PresenceState = Record<string, unknown>

function computeOnlineUserIds(channel: RealtimeChannel): string[] {
  const state = channel.presenceState() as PresenceState
  return Object.keys(state).filter((key) => typeof key === 'string' && key.length > 0)
}

export function usePresence(currentUserId: string | null | undefined): UsePresenceResult {
  const [status, setStatus] = useState<PresenceStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [onlineUserIdList, setOnlineUserIdList] = useState<string[]>([])

  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let cancelled = false

    // Reset when unauthenticated
    if (!currentUserId) {
      setStatus('idle')
      setError(null)
      setOnlineUserIdList([])
      return
    }

    setStatus('connecting')
    setError(null)

    const channel = supabase.channel('presence:chat', {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    })

    channelRef.current = channel

    function syncFromChannel(): void {
      if (cancelled) return
      setOnlineUserIdList(computeOnlineUserIds(channel))
    }

    channel.on('presence', { event: 'sync' }, () => {
      syncFromChannel()
    })

    channel.on('presence', { event: 'join' }, () => {
      syncFromChannel()
    })

    channel.on('presence', { event: 'leave' }, () => {
      syncFromChannel()
    })

    channel.subscribe((subscribeStatus, err) => {
      if (cancelled) return

      if (subscribeStatus === 'SUBSCRIBED') {
        setStatus('online')
        try {
          channel.track({ online_at: new Date().toISOString() })
        } catch {
          // ignore tracking errors
        }
        return
      }

      if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        setStatus('error')
        setError(err?.message || `Presence subscription failed: ${subscribeStatus}`)
      }
    })

    return () => {
      cancelled = true
      const ch = channelRef.current
      channelRef.current = null
      if (ch) {
        try {
          ch.untrack()
        } catch {
          // ignore
        }
        try {
          supabase.removeChannel(ch)
        } catch {
          // ignore
        }
      }
    }
  }, [currentUserId])

  const onlineUserIds = useMemo(() => new Set(onlineUserIdList), [onlineUserIdList])

  const isUserOnline = useMemo(() => {
    return (userId: string | null | undefined): boolean => {
      if (!userId) return false
      return onlineUserIds.has(userId)
    }
  }, [onlineUserIds])

  return { status, error, onlineUserIds, isUserOnline }
}
