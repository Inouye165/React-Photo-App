import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GamesIndex from './GamesIndex'

const { navigateMock, listMyGamesMock, createChessGameMock, searchUsersMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  listMyGamesMock: vi.fn(async () => []),
  createChessGameMock: vi.fn(async () => ({ id: 'new-game' })),
  searchUsersMock: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../api/games', () => ({
  listMyGames: listMyGamesMock,
  createChessGame: createChessGameMock,
}))

vi.mock('../api/chat', () => ({
  searchUsers: searchUsersMock,
}))

describe('GamesIndex', () => {
  let timeoutId = 0
  const timeoutCallbacks = new Map<number, () => void>()

  beforeEach(() => {
    vi.clearAllMocks()
    timeoutId = 0
    timeoutCallbacks.clear()

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((handler: TimerHandler) => {
      timeoutId += 1
      if (typeof handler === 'function') {
        timeoutCallbacks.set(timeoutId, handler as () => void)
      }
      return timeoutId as unknown as ReturnType<typeof setTimeout>
    })
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation((id?: string | number | ReturnType<typeof setTimeout>) => {
      timeoutCallbacks.delete(Number(id))
    })

    searchUsersMock.mockResolvedValue([])
  })

  afterEach(() => {
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
      timeoutCallbacks.get(timeoutId)?.()
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
      timeoutCallbacks.get(1)?.()
    })

    fireEvent.change(input, { target: { value: 'alice' } })
    await act(async () => {
      timeoutCallbacks.get(2)?.()
    })

    await act(async () => {
      resolveSecond([{ id: 'new', username: 'alice', avatar_url: null }])
      await Promise.resolve()
    })
    expect(screen.getByText('alice')).toBeInTheDocument()

    await act(async () => {
      resolveFirst([{ id: 'old', username: 'alex', avatar_url: null }])
      await Promise.resolve()
    })
    expect(screen.queryByText('alex')).not.toBeInTheDocument()
  })
})
