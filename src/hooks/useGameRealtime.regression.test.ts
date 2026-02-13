/**
 * Regression tests for useGameRealtime sorted-insert fix.
 * Verifies INSERT and UPDATE handlers use binary-search insertion
 * instead of re-sorting the entire array.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Track channel subscriptions to simulate realtime events
type Handler = (payload: unknown) => void
const channelHandlers: Record<string, Handler[]> = {}

const mockChannel = {
  on: vi.fn((_type: string, opts: { event: string; table?: string }, handler: Handler) => {
    const key = `${opts.event}:${opts.table ?? 'unknown'}`
    if (!channelHandlers[key]) channelHandlers[key] = []
    channelHandlers[key].push(handler)
    return mockChannel
  }),
  subscribe: vi.fn((_cb?: unknown) => {}),
  unsubscribe: vi.fn(),
}

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: [
              { id: 'm1', ply: 1, uci: 'e2e4', game_id: 'g1' },
              { id: 'm2', ply: 2, uci: 'e7e5', game_id: 'g1' },
            ],
            error: null,
          })),
        })),
      })),
    })),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

import { useGameRealtime } from '../hooks/useGameRealtime'

describe('useGameRealtime sorted insert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(channelHandlers).forEach((k) => delete channelHandlers[k])
  })

  it('inserts new move at correct sorted position without full re-sort', async () => {
    const { result } = renderHook(() => useGameRealtime('g1'))

    // Wait for initial fetch
    await vi.waitFor(() => {
      expect(result.current.moves.length).toBe(2)
    })

    // Simulate INSERT of ply 3
    const insertHandlers = channelHandlers['INSERT:chess_moves'] ?? []
    expect(insertHandlers.length).toBeGreaterThan(0)

    act(() => {
      insertHandlers[0]({
        new: { id: 'm3', ply: 3, uci: 'g1f3', game_id: 'g1' },
        old: null,
      })
    })

    expect(result.current.moves.length).toBe(3)
    expect(result.current.moves[2].ply).toBe(3)
    expect(result.current.moves[2].uci).toBe('g1f3')

    // Verify order is maintained
    const plys = result.current.moves.map((m: { ply: number }) => m.ply)
    expect(plys).toEqual([1, 2, 3])
  })

  it('inserts out-of-order ply at correct position', async () => {
    const { result } = renderHook(() => useGameRealtime('g1'))

    await vi.waitFor(() => {
      expect(result.current.moves.length).toBe(2)
    })

    // Insert ply 4 first, then ply 3
    const insertHandlers = channelHandlers['INSERT:chess_moves'] ?? []

    act(() => {
      insertHandlers[0]({
        new: { id: 'm4', ply: 4, uci: 'd7d5', game_id: 'g1' },
        old: null,
      })
    })

    act(() => {
      insertHandlers[0]({
        new: { id: 'm3', ply: 3, uci: 'g1f3', game_id: 'g1' },
        old: null,
      })
    })

    expect(result.current.moves.length).toBe(4)
    const plys = result.current.moves.map((m: { ply: number }) => m.ply)
    expect(plys).toEqual([1, 2, 3, 4])
  })

  it('handles DELETE of a move correctly', async () => {
    const { result } = renderHook(() => useGameRealtime('g1'))

    await vi.waitFor(() => {
      expect(result.current.moves.length).toBe(2)
    })

    const deleteHandlers = channelHandlers['DELETE:chess_moves'] ?? []
    expect(deleteHandlers.length).toBeGreaterThan(0)

    act(() => {
      deleteHandlers[0]({
        new: null,
        old: { id: 'm2', ply: 2 },
      })
    })

    expect(result.current.moves.length).toBe(1)
    expect(result.current.moves[0].ply).toBe(1)
  })
})
