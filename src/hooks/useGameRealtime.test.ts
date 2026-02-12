import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameRealtime } from './useGameRealtime'

const {
  mockSelectResult,
  registerHandler,
  invokeHandler,
  subscribeMock,
  unsubscribeMock,
  removeChannelMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, (payload: any) => void>()

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

  return {
    mockSelectResult: vi.fn(),
    registerHandler: register,
    invokeHandler: invoke,
    subscribeMock: vi.fn(),
    unsubscribeMock: vi.fn(),
    removeChannelMock: vi.fn(),
  }
})

vi.mock('../supabaseClient', () => {
  const channel = {
    on: vi.fn((_event: string, filter: { event: string; table: string }, handler: (payload: any) => void) => {
      registerHandler(filter, handler)
      return channel
    }),
    subscribe: subscribeMock,
    unsubscribe: unsubscribeMock,
  }

  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => mockSelectResult()),
      })),
    })),
  }))

  return {
    supabase: {
      from,
      channel: vi.fn(() => channel),
      removeChannel: removeChannelMock,
    },
  }
})

describe('useGameRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectResult.mockResolvedValue({
      data: [
        { id: 'm1', ply: 1, uci: 'e2e4' },
        { id: 'm2', ply: 2, uci: 'e7e5' },
      ],
      error: null,
    })
  })

  it('handles delete events and game update refresh', async () => {
    const { result } = renderHook(() => useGameRealtime('game-1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.moves).toHaveLength(2)
    })

    await act(async () => {
      invokeHandler('DELETE', 'chess_moves', { old: { id: 'm2', ply: 2 } })
    })

    expect(result.current.moves.map((m) => m.id)).toEqual(['m1'])

    mockSelectResult.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    await act(async () => {
      invokeHandler('UPDATE', 'games', { new: { id: 'game-1' } })
    })

    await waitFor(() => {
      expect(result.current.moves).toEqual([])
    })
  })

  it('subscribes and unsubscribes the channel', async () => {
    const { unmount } = renderHook(() => useGameRealtime('game-2'))

    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(removeChannelMock).toHaveBeenCalledTimes(1)
  })
})
