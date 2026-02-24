import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GamesIndex from './GamesIndex'

type MockGame = {
  id: string
  type: string
  status: string
  created_by: string
  created_at: string
  updated_at: string
  time_control: null
  current_fen: string
  current_turn: string | null
  result: null
  members: Array<{ user_id: string; role: string; username: string | null }>
}

function makeGame(overrides: Partial<MockGame> = {}): MockGame {
  const base: MockGame = {
    id: 'g-1',
    type: 'chess',
    status: 'active',
    created_by: 'user-1',
    created_at: '2026-02-23T10:00:00.000Z',
    updated_at: '2026-02-23T10:00:00.000Z',
    time_control: null,
    current_fen: 'start',
    current_turn: 'white',
    result: null,
    members: [
      { user_id: 'user-1', role: 'white', username: 'me' },
      { user_id: 'user-2', role: 'black', username: 'opponent' },
    ],
  }

  return {
    ...base,
    ...overrides,
    members: overrides.members ?? base.members,
  }
}

const {
  navigateMock,
  listMyGamesWithMembersMock,
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
    listMyGamesWithMembersMock: vi.fn<() => Promise<MockGame[]>>(async () => []),
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
  listMyGamesWithMembers: listMyGamesWithMembersMock,
  createChessGame: createChessGameMock,
}))

vi.mock('react-chessboard', () => ({
  Chessboard: ({ position, boardOrientation }: { position?: string; boardOrientation?: 'white' | 'black' }) => (
    <div data-testid="chessboard" data-position={position} data-orientation={boardOrientation} />
  ),
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

    const inviteButtons = screen.getAllByRole('button', { name: 'Invite player' })
    fireEvent.click(inviteButtons[0])
    await act(async () => {
      await Promise.resolve()
    })

    const input = screen.getByLabelText('Search by username')

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

    const inviteButtons = screen.getAllByRole('button', { name: 'Invite player' })
    fireEvent.click(inviteButtons[0])
    await act(async () => {
      await Promise.resolve()
    })

    const input = screen.getByLabelText('Search by username')

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
    listMyGamesWithMembersMock
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

    expect(listMyGamesWithMembersMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Failed to load games. Please retry.')).not.toBeInTheDocument()
  })

  it('refreshes game list from realtime events without interval polling', async () => {
    listMyGamesWithMembersMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeGame({ id: 'g1', status: 'waiting', members: [] })])

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    render(<GamesIndex />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listMyGamesWithMembersMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      emitRealtime('game_members', 'INSERT', { new: { user_id: 'user-1', game_id: 'g1' } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listMyGamesWithMembersMock).toHaveBeenCalledTimes(2)
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(subscribeMock).toHaveBeenCalled()
  })

  it('renders Back to Chess and navigates to /chess', async () => {
    render(<GamesIndex />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Back to Chess' }))
    expect(navigateMock).toHaveBeenCalledWith('/chess')
  })

  it('shows Continue for selected open game and navigates on click', async () => {
    listMyGamesWithMembersMock.mockResolvedValueOnce([
      makeGame({
        id: 'g-open',
        status: 'active',
        updated_at: '2026-02-23T12:00:00.000Z',
        current_fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
        members: [
          { user_id: 'user-1', role: 'white', username: 'me' },
          { user_id: 'user-2', role: 'black', username: 'alice' },
        ],
      }),
    ])

    render(<GamesIndex />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const currentButtons = screen.getAllByRole('button', { name: 'Current games' })
    fireEvent.click(currentButtons[0])
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByTestId('chessboard')).toHaveAttribute('data-position', '4k3/8/8/8/8/8/8/4K3 w - - 0 1')

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(navigateMock).toHaveBeenCalledWith('/games/g-open')
  })

  it('selects a match from list before opening and updates stage details', async () => {
    listMyGamesWithMembersMock.mockResolvedValueOnce([
      makeGame({
        id: 'g-alice',
        status: 'active',
        updated_at: '2026-02-23T10:00:00.000Z',
        members: [
          { user_id: 'user-1', role: 'white', username: 'me' },
          { user_id: 'user-2', role: 'black', username: 'Alice' },
        ],
      }),
      makeGame({
        id: 'g-bob',
        status: 'active',
        updated_at: '2026-02-23T12:00:00.000Z',
        members: [
          { user_id: 'user-1', role: 'white', username: 'me' },
          { user_id: 'user-3', role: 'black', username: 'Bob' },
        ],
      }),
    ])

    render(<GamesIndex />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const currentButtons2 = screen.getAllByRole('button', { name: 'Current games' })
    fireEvent.click(currentButtons2[0])
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { name: 'vs Bob' })).toBeInTheDocument()

    const aliceGameButton = screen.getByRole('button', { name: /Chess vs Alice/i })
    fireEvent.click(aliceGameButton)

    expect(aliceGameButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'vs Alice' })).toBeInTheDocument()
  })

})
