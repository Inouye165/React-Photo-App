import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatRealtime } from './useChatRealtime'

const {
  mockSelectResult,
  registerHandler,
  invokeHandler,
  emitSubscribeStatus,
  subscribeCallbacks,
  resetRealtimeMocks,
  subscribeMock,
  unsubscribeMock,
  removeChannelMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, (payload: any) => void>()
  const subscribeCallbacks: Array<(status: string, err?: { message?: string }) => void> = []

  const toKey = (event: string, table: string) => `${event}:${table}`

  const register = (filter: { event: string; table: string }, handler: (payload: any) => void) => {
    handlers.set(toKey(filter.event, filter.table), handler)
  }

  const invoke = (event: string, table: string, payload: any) => {
    const handler = handlers.get(toKey(event, table))
    if (!handler) {
      throw new Error(`Missing handler for ${event}:${table}`)
    }
    handler(payload)
  }

  const emitStatus = (status: string, err?: { message?: string }, index?: number) => {
    const targetIndex = typeof index === 'number' ? index : subscribeCallbacks.length - 1
    const cb = subscribeCallbacks[targetIndex]
    if (!cb) {
      throw new Error(`Missing subscribe callback at index ${targetIndex}`)
    }
    cb(status, err)
  }

  const reset = () => {
    handlers.clear()
    subscribeCallbacks.length = 0
  }

  return {
    mockSelectResult: vi.fn(),
    registerHandler: register,
    invokeHandler: invoke,
    emitSubscribeStatus: emitStatus,
    subscribeCallbacks,
    resetRealtimeMocks: reset,
    subscribeMock: vi.fn(),
    unsubscribeMock: vi.fn(),
    removeChannelMock: vi.fn(),
  }
})

vi.mock('../supabaseClient', () => {
  const createChannel = () => {
    const channel = {
      on: vi.fn((_event: string, filter: { event: string; table: string }, handler: (payload: any) => void) => {
        registerHandler(filter, handler)
        return channel
      }),
      subscribe: vi.fn((callback: (status: string, err?: { message?: string }) => void) => {
        subscribeCallbacks.push(callback)
        subscribeMock(callback)
      }),
      unsubscribe: unsubscribeMock,
    }

    return channel
  }

  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => mockSelectResult()),
        })),
      })),
    })),
  }))

  return {
    supabase: {
      from,
      channel: vi.fn(() => createChannel()),
      removeChannel: removeChannelMock,
    },
  }
})

describe('useChatRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    resetRealtimeMocks()
    mockSelectResult.mockResolvedValue({
      data: [
        {
          id: 'm1',
          room_id: 'room-1',
          sender_id: 'user-a',
          content: 'hello',
          photo_id: null,
          created_at: '2026-03-19T19:00:00.000Z',
        },
      ],
      error: null,
    })
  })

  it('loads initial messages and applies insert events', async () => {
    const { result } = renderHook(() => useChatRealtime('room-1', { userId: 'user-a' }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.messages).toHaveLength(1)
    })

    await act(async () => {
      invokeHandler('INSERT', 'messages', {
        new: {
          id: 'm2',
          room_id: 'room-1',
          sender_id: 'user-b',
          content: 'reply',
          photo_id: null,
          created_at: '2026-03-19T19:00:02.000Z',
        },
      })
    })

    expect(result.current.messages.map((message) => message.id)).toEqual(['m1', 'm2'])
  })

  it('reconnects and refetches after channel error', async () => {
    renderHook(() => useChatRealtime('room-1', { userId: 'user-a' }))

    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledTimes(1)
    })

    const initialFetchCalls = mockSelectResult.mock.calls.length

    await act(async () => {
      emitSubscribeStatus('CHANNEL_ERROR', { message: 'socket down' })
    })

    await waitFor(() => {
      expect(subscribeMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    await waitFor(() => {
      expect(mockSelectResult.mock.calls.length).toBeGreaterThan(initialFetchCalls)
    })
  })

  it('polls while realtime is unhealthy and stops polling after recovery', async () => {
    vi.useFakeTimers()
    renderHook(() => useChatRealtime('room-1', { userId: 'user-a' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(subscribeMock).toHaveBeenCalledTimes(1)

    const callsAfterInitial = mockSelectResult.mock.calls.length

    await act(async () => {
      emitSubscribeStatus('CHANNEL_ERROR', { message: 'socket down' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })

    expect(mockSelectResult.mock.calls.length).toBeGreaterThan(callsAfterInitial)

    const callsAfterPoll = mockSelectResult.mock.calls.length

    await act(async () => {
      emitSubscribeStatus('SUBSCRIBED', undefined, subscribeCallbacks.length - 1)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })

    expect(mockSelectResult.mock.calls.length).toBe(callsAfterPoll)
  })

  it('refetches when window focus returns', async () => {
    renderHook(() => useChatRealtime('room-1', { userId: 'user-a' }))

    await waitFor(() => {
      expect(mockSelectResult).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(mockSelectResult.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
