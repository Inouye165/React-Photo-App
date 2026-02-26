import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChessHub from './ChessHub'
import { fetchGameMembers, listMyGamesWithMembers } from '../api/games'

vi.mock('../api/games', () => ({
  listMyGamesWithMembers: vi.fn(async () => ([])),
  fetchGameMembers: vi.fn(async () => ([])),
}))

vi.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="greatest-games-board" />,
}))

const authState = vi.hoisted<{
  user: { id: string; email: string } | null
  profile: { username: string } | null
}>(() => ({
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

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
}

function installMatchMediaMock(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => {
      const minWidthMatch = query.match(/min-width:\s*(\d+)px/)
      const minWidth = minWidthMatch ? Number(minWidthMatch[1]) : 0
      const matches = query.includes('prefers-reduced-motion')
        ? false
        : window.innerWidth >= minWidth

      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList
    }),
  })
}

describe('ChessHub', () => {
  const listMyGamesWithMembersMock = vi.mocked(listMyGamesWithMembers)
  const fetchGameMembersMock = vi.mocked(fetchGameMembers)

  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'user-1', email: 'player@example.com' }
    authState.profile = { username: 'player1' }
    setViewport(390)
    installMatchMediaMock()
    listMyGamesWithMembersMock.mockResolvedValue([])
    fetchGameMembersMock.mockResolvedValue([])
  })

  it('renders desktop modules at 1280px', async () => {
    setViewport(1280)

    render(<ChessHub />)

    expect(screen.getByRole('heading', { name: 'Play Computer' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Play a Friend' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Learn Chess' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Greatest Games of All Time' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Choose a mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Continue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Match Table' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(listMyGamesWithMembersMock).toHaveBeenCalledTimes(1)
    })
  })

  it('renders mobile layout and hides desktop-only modules on small screens', async () => {
    setViewport(375)

    render(<ChessHub />)

    expect(screen.getByRole('region', { name: 'Loading hero' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Social Hub' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Greatest Games of All Time' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(listMyGamesWithMembersMock).toHaveBeenCalledTimes(1)
    })
  })

  it('renders mobile mode artwork and opens game of the week', async () => {
    setViewport(375)
    const user = userEvent.setup()

    render(<ChessHub />)

    expect(screen.getByRole('img', { name: 'Chess board training setup artwork' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two players preparing for a chess match' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Chess lesson notebook and study board' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Watch full game' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Watch full game' }))

    expect(navigateMock).toHaveBeenCalledWith('/games/chess/gotw/byrne-vs-fischer-1956')
  })

  it('renders logged-in indicator in chess header', () => {
    setViewport(375)

    render(<ChessHub />)

    expect(screen.getByRole('button', { name: 'Account menu for player1' })).toBeInTheDocument()
    expect(screen.getByText('player1')).toBeInTheDocument()
  })

  it('renders sign-in indicator when auth user is missing', async () => {
    setViewport(375)
    authState.user = null
    authState.profile = null
    const user = userEvent.setup()

    render(<ChessHub />)

    const signInButton = screen.getByRole('button', { name: 'Sign in' })
    expect(signInButton).toBeInTheDocument()
    await user.click(signInButton)
    expect(navigateMock).toHaveBeenCalledWith('/login')
  })

  it('keeps modes row chevron icons rendered', () => {
    setViewport(375)
    render(<ChessHub />)

    const chevrons = document.querySelectorAll('svg.lucide-chevron-right')
    expect(chevrons).toHaveLength(3)
  })

  it('renders Chess title and the three mode CTAs', async () => {
    render(<ChessHub />)
    const modesRegion = screen.getByRole('region', { name: 'Game modes' })
    const modeScope = within(modesRegion)

    expect(screen.getByRole('heading', { name: 'Chess' })).toBeInTheDocument()
    expect(modeScope.getAllByRole('button', { name: /Play Computer/i }).length).toBeGreaterThan(0)
    expect(modeScope.getAllByRole('button', { name: /Play a Friend/i }).length).toBeGreaterThan(0)
    expect(modeScope.getAllByRole('button', { name: /Learn Chess/i }).length).toBeGreaterThan(0)

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
    const heroCard = await screen.findByTestId('chess-mobile-hero-card')

    const continueButton = within(heroCard).getByRole('button', { name: /Continue game/i })
    await user.click(continueButton)

    expect(navigateMock).toHaveBeenCalledWith('/games/g-2')
  })

  it('shows Play vs Computer quick start when no open games and navigates', async () => {
    const user = userEvent.setup()
    render(<ChessHub />)
    const heroCard = await screen.findByTestId('chess-mobile-hero-card')

    const quickStartButton = within(heroCard).getByRole('button', { name: 'Play Computer' })
    await user.click(quickStartButton)

    expect(navigateMock).toHaveBeenCalledWith('/games/local?tab=analyze')
  })

  it('routes Play a Friend CTA to games dashboard', async () => {
    const user = userEvent.setup()
    render(<ChessHub />)

    await user.click(screen.getByRole('button', { name: 'Play a Friend' }))

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

    expect(await screen.findByText('Unable to load active game.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(listMyGamesWithMembersMock).toHaveBeenCalledTimes(2)
    })
  })
})