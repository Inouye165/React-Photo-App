import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChessHub from './ChessHub'

const { navigateMock, createGameAndOpenTutorTabMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  createGameAndOpenTutorTabMock: vi.fn(async (navigate: (path: string) => void, tab: string) => {
    navigate(`/games/test-game?tab=${tab}`)
    return 'test-game'
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../features/chess/navigation', () => ({
  createGameAndOpenTutorTab: createGameAndOpenTutorTabMock,
}))

describe('ChessHub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders three primary actions', () => {
    render(<ChessHub />)

    expect(screen.getByRole('button', { name: /Play vs Computer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Play vs Opponent \(Invite\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tutorials/i })).toBeInTheDocument()
  })

  it('routes actions into existing chess flows', async () => {
    const user = userEvent.setup()
    render(<ChessHub />)

    await user.click(screen.getByRole('button', { name: /Play vs Computer/i }))
    expect(navigateMock).toHaveBeenCalledWith('/games/local?tab=analyze')

    await user.click(screen.getByRole('button', { name: /Play vs Opponent \(Invite\)/i }))
    expect(navigateMock).toHaveBeenCalledWith('/games')

    await user.click(screen.getByRole('button', { name: /Tutorials/i }))
    await waitFor(() => {
      expect(createGameAndOpenTutorTabMock).toHaveBeenCalledWith(navigateMock, 'lesson')
    })
    expect(navigateMock).toHaveBeenCalledWith('/games/test-game?tab=lesson')
  })
})