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
})
