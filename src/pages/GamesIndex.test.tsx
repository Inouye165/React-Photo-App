import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GamesIndex from './GamesIndex'

const {
  navigateMock,
  listMyGamesMock,
  createChessGameMock,
  searchUsersMock,
  removeChannelMock,
  subscribeMock,
  channelOnMock,
  emitRealtime,
  onGamesChangedMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, (payload?: any) => void>()
  const keyOf = (table: string, event: string) => `${table}:${event}`

  const channelOnMock = vi.fn((_type: string, filter: { table: string; event: string }, handler: (payload?: any) => void) => {
    handlers.set(keyOf(filter.table, filter.event), handler)
    return channelMock
  })

  const subscribeMock = vi.fn(() => channelMock)

  const channelMock = {
    on: channelOnMock,
    subscribe: subscribeMock,
    unsubscribe: vi.fn(),
  }

  const emitRealtime = (table: string, event: string, payload?: any) => {
    const exact = handlers.get(keyOf(table, event))
    const wildcard = handlers.get(keyOf(table, '*'))
    const handler = exact || wildcard
    if (!handler) throw new Error(`Missing handler for ${table}:${event}`)
    handler(payload)
  }

  const offGamesChangedMock = vi.fn()
  const onGamesChangedMock = vi.fn(() => offGamesChangedMock)

  return {
    navigateMock: vi.fn(),
    listMyGamesMock: vi.fn(async () => []),
    createChessGameMock: vi.fn(async () => ({ id: 'new-game' })),
    searchUsersMock: vi.fn(),
    removeChannelMock: vi.fn(),
    subscribeMock,
    channelOnMock,
    emitRealtime,
    onGamesChangedMock,
    offGamesChangedMock,
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: channelOnMock,
      subscribe: subscribeMock,
      unsubscribe: vi.fn(),
    })),
    removeChannel: removeChannelMock,
  },
}))

vi.mock('../events/gamesEvents', () => ({
  onGamesChanged: onGamesChangedMock,
}))

vi.mock('../api/games', () => ({
  listMyGames: listMyGamesMock,
  createChessGame: createChessGameMock,
}))

vi.mock('../api/chat', () => ({
  searchUsers: searchUsersMock,
}))

describe('GamesIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    searchUsersMock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('debounces user search requests', async () => {
    render(<GamesIndex />)

    const input = screen.getByPlaceholderText('Search users')

    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.change(input, { target: { value: 'al' } })
    fireEvent.change(input, { target: { value: 'ali' } })

    expect(searchUsersMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(searchUsersMock).toHaveBeenCalledTimes(1)
    expect(searchUsersMock).toHaveBeenCalledWith('ali')
  })

  it('ignores stale search responses and only shows latest results', async () => {
    let resolveFirst: (value: Array<{ id: string; username: string | null; avatar_url: string | null }>) => void = () => {}
    let resolveSecond: (value: Array<{ id: string; username: string | null; avatar_url: string | null }>) => void = () => {}

    searchUsersMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))

    render(<GamesIndex />)

    const input = screen.getByPlaceholderText('Search users')

    fireEvent.change(input, { target: { value: 'al' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    fireEvent.change(input, { target: { value: 'alice' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    await act(async () => {
      resolveSecond([{ id: 'new', username: 'alice', avatar_url: null }])
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('alice')).toBeInTheDocument()

    await act(async () => {
      resolveFirst([{ id: 'old', username: 'alex', avatar_url: null }])
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByText('alex')).not.toBeInTheDocument()
  })

  it('shows load error and retries list fetch', async () => {
    listMyGamesMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([])

    render(<GamesIndex />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Failed to load games. Please retry.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(listMyGamesMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Failed to load games. Please retry.')).not.toBeInTheDocument()
  })

  it('refreshes game list from realtime events without interval polling', async () => {
    listMyGamesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'g1', status: 'waiting', type: 'chess', members: [] }] as any)

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    render(<GamesIndex />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listMyGamesMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      emitRealtime('game_members', 'INSERT', { new: { user_id: 'user-1', game_id: 'g1' } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listMyGamesMock).toHaveBeenCalledTimes(2)
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(subscribeMock).toHaveBeenCalled()
  })
})
