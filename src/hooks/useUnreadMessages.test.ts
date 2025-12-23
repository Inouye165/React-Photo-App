import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useUnreadMessages } from './useUnreadMessages'
import { supabase } from '../supabaseClient'

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

describe('useUnreadMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calculates unread count correctly based on last_read_at', async () => {
    const userId = 'user1'
    const now = new Date().getTime()
    const oneHourAgo = new Date(now - 3600000).toISOString()
    const twoHoursAgo = new Date(now - 7200000).toISOString()

    // Mock room_members response
    const mockMemberships = [
      { room_id: 'roomA', last_read_at: twoHoursAgo },
      { room_id: 'roomB', last_read_at: oneHourAgo },
    ]

    // Mock messages response
    // Message 1: roomA, 1.5 hours ago (UNREAD because > 2 hours ago)
    // Message 2: roomA, 2.5 hours ago (READ because < 2 hours ago)
    // Message 3: roomB, 0.5 hours ago (UNREAD because > 1 hour ago)
    // Message 4: roomB, 1.5 hours ago (READ because < 1 hour ago)
    const mockMessages = [
      { room_id: 'roomA', created_at: new Date(now - 5400000).toISOString() }, // 1.5h ago
      { room_id: 'roomA', created_at: new Date(now - 9000000).toISOString() }, // 2.5h ago
      { room_id: 'roomB', created_at: new Date(now - 1800000).toISOString() }, // 0.5h ago
      { room_id: 'roomB', created_at: new Date(now - 5400000).toISOString() }, // 1.5h ago
    ]

    const fromMock = vi.fn().mockImplementation((table) => {
      if (table === 'room_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: mockMemberships, error: null }),
        }
      }
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          gt: vi.fn().mockResolvedValue({ data: mockMessages, error: null }),
        }
      }
      return { select: vi.fn() }
    })
    
    // @ts-ignore
    supabase.from.mockImplementation(fromMock)

    const channelMock = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }
    // @ts-ignore
    supabase.channel.mockReturnValue(channelMock)

    const { result } = renderHook(() => useUnreadMessages(userId))

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Expected unread: Message 1 (roomA) and Message 3 (roomB) -> total 2
    expect(result.current.unreadCount).toBe(2)
    expect(result.current.unreadByRoom).toEqual({
      roomA: 1,
      roomB: 1,
    })
  })
})
