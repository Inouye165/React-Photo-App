import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useChatTyping } from './useChatTyping'

describe('useChatTyping', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces broadcasts and clears after inactivity', async () => {
    const roomId = 'room1'
    const userId = 'user1'

    const channel = {
      send: vi.fn(),
      subscribe: vi.fn(),
      on: vi.fn(),
      unsubscribe: vi.fn(),
    }
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }

    const { result } = renderHook(() => useChatTyping({ roomId, userId, supabase }))

    // Multiple rapid changes should only send `typing:true` once.
    act(() => {
      result.current.handleInputChange()
      result.current.handleInputChange()
      result.current.handleInputChange()
    })

    expect(channel.send).toHaveBeenCalledTimes(1)
    expect(channel.send).toHaveBeenLastCalledWith({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, typing: true },
    })

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(channel.send).toHaveBeenCalledTimes(2)
    expect(channel.send).toHaveBeenLastCalledWith({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, typing: false },
    })
  })

  it('cleans up the channel on unmount', () => {
    const roomId = 'room1'
    const userId = 'user1'

    const channel = {
      send: vi.fn(),
      subscribe: vi.fn(),
      on: vi.fn(),
      unsubscribe: vi.fn(),
    }
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }

    const { unmount, result } = renderHook(() => useChatTyping({ roomId, userId, supabase }))

    act(() => {
      result.current.handleInputChange()
    })

    unmount()

    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
  })
})
