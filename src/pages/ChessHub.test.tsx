import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChessHub from './ChessHub'
import { listMyGamesWithMembers } from '../api/games'

vi.mock('../api/games', () => ({
  listMyGamesWithMembers: vi.fn(async () => ([])),
}))

const authState = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'player@example.com' },
  profile: { username: 'player1' },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

describe('ChessHub', () => {
  const listMyGamesWithMembersMock = vi.mocked(listMyGamesWithMembers)

  beforeEach(() => {
    vi.clearAllMocks()
    listMyGamesWithMembersMock.mockResolvedValue([])
  })

  it('renders Chess title and the three mode CTAs', async () => {
    render(<ChessHub />)

    expect(screen.getByRole('heading', { name: 'Chess' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play Computer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play a Friend' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Learn Chess' })).toBeInTheDocument()

    await waitFor(() => {
      expect(listMyGamesWithMembersMock).toHaveBeenCalledTimes(1)
    })
  })

  it('shows Continue for open games and navigates to game detail', async () => {
    listMyGamesWithMembersMock.mockResolvedValueOnce([
      {
        id: 'g-2',
        type: 'chess',
        status: 'active',
        created_by: 'user-1',
        created_at: '2026-02-20T10:00:00.000Z',
        updated_at: '2026-02-22T11:00:00.000Z',
        time_control: null,
        current_fen: '',
        current_turn: null,
        result: null,
        members: [
          { user_id: 'user-1', role: 'white', username: 'player1' },
          { user_id: 'user-2', role: 'black', username: 'Rival' },
        ],
      },
    ])

    const user = userEvent.setup()
    render(<ChessHub />)

    const continueButton = await screen.findByRole('button', { name: 'Continue Game' })
    await user.click(continueButton)

    expect(navigateMock).toHaveBeenCalledWith('/games/g-2')
  })

  it('shows Play vs Computer quick start when no open games and navigates', async () => {
    const user = userEvent.setup()
    render(<ChessHub />)

    const quickStartButton = await screen.findByRole('button', { name: 'Play Computer' })
    await user.click(quickStartButton)

    expect(navigateMock).toHaveBeenCalledWith('/games/local?tab=analyze')
  })

  it('routes Play vs Opponent CTA to games dashboard', async () => {
    const user = userEvent.setup()
    render(<ChessHub />)

    await user.click(screen.getByRole('button', { name: 'View History' }))

    expect(navigateMock).toHaveBeenCalledWith('/games')
  })

  it('routes Tutorials CTA to tutor flow', async () => {
    const user = userEvent.setup()
    render(<ChessHub />)

    await user.click(screen.getByRole('button', { name: 'Learn Chess' }))

    expect(navigateMock).toHaveBeenCalledWith('/games/local?tab=lesson&tutor=1&storyId=architect-of-squares')
  })

  it('shows inline error and retries fetch when loading fails', async () => {
    listMyGamesWithMembersMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([])

    const user = userEvent.setup()
    render(<ChessHub />)

    expect(await screen.findByText('Unable to load your recent chess games right now.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(listMyGamesWithMembersMock).toHaveBeenCalledTimes(2)
    })
  })
})