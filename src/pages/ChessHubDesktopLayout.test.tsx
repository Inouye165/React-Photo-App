import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Bot } from 'lucide-react'
import type { GameWithMembers } from '../api/games'
import ChessHubDesktopLayout from './ChessHubDesktopLayout'

vi.mock('./GreatestGamesCard', () => ({
  default: () => <div data-testid="gotw-card">Greatest Games</div>,
}))

function makeModeItems(onClickLocal = vi.fn()) {
  return [
    {
      key: 'local',
      title: 'Play Computer',
      description: 'Practice against the computer.',
      chips: ['Engine'],
      imageSrc: '/chess-hub/human_vs_computer_chess.webp',
      imageAlt: 'Play computer artwork',
      onClick: onClickLocal,
      icon: Bot,
    },
  ]
}

const modeItems = makeModeItems()

const baseGame: GameWithMembers = {
  id: 'game-1',
  type: 'chess',
  status: 'active',
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  time_control: null,
  current_fen: '',
  current_turn: null,
  result: null,
  members: [
    { user_id: 'user-1', role: 'white', username: 'player1' },
    { user_id: 'user-2', role: 'black', username: 'rival' },
  ],
}

function renderDesktop(overrides: Partial<Parameters<typeof ChessHubDesktopLayout>[0]> = {}) {
  return render(
    <ChessHubDesktopLayout
      isLoading={false}
      loadError={null}
      onRetry={vi.fn()}
      modeItems={modeItems}
      singleActiveGame={baseGame}
      activeGames={[baseGame]}
      historyGames={[]}
      getOpponentLabel={() => 'rival'}
      formatRelative={() => 'just now'}
      isInviteStatus={() => false}
      onOpenHome={vi.fn()}
      onOpenGame={vi.fn()}
      isAuthenticated
      accountDisplayName="player1"
      accountInitials="P"
      onOpenSignIn={vi.fn()}
      {...overrides}
    />,
  )
}

afterEach(() => {
  vi.mocked(window.localStorage.getItem).mockReset()
})

describe('ChessHubDesktopLayout', () => {
  it('renders the Greatest Games card in the right rail', () => {
    renderDesktop()
    expect(screen.getByTestId('gotw-card')).toBeInTheDocument()
  })

  it('shows "New game" on Play Computer card when only an online friend game is active', () => {
    // No chess:save:local — only a friend game in singleActiveGame
    renderDesktop({ singleActiveGame: baseGame, activeGames: [baseGame] })

    const statusSection = screen.getByTestId('play-computer-status')
    expect(within(statusSection).getByText('No saved game yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument()
  })

  it('shows "Resume game" on Play Computer card only when a local save exists', () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => {
      if (key === 'chess:save:local') {
        return JSON.stringify({
          savedAt: new Date().toISOString(),
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          moves: [],
        })
      }
      return null
    })

    renderDesktop({ singleActiveGame: baseGame, activeGames: [baseGame] })

    const statusSection = screen.getByTestId('play-computer-status')
    expect(within(statusSection).getByText('vs Computer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume game' })).toBeInTheDocument()
  })

  it('navigates to local game route (not online game) when clicking Resume on Play Computer', async () => {
    const user = userEvent.setup()
    const onClickLocal = vi.fn()
    const onOpenGame = vi.fn()

    vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => {
      if (key === 'chess:save:local') {
        return JSON.stringify({
          savedAt: new Date().toISOString(),
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
          moves: [],
        })
      }
      return null
    })

    renderDesktop({
      modeItems: makeModeItems(onClickLocal),
      singleActiveGame: baseGame,
      activeGames: [baseGame],
      onOpenGame,
    })

    const resumeButton = screen.getByRole('button', { name: 'Resume game' })
    await user.click(resumeButton)

    // Should call mode.onClick (navigates to /games/local), NOT onOpenGame (which navigates to the friend game)
    expect(onClickLocal).toHaveBeenCalled()
    expect(onOpenGame).not.toHaveBeenCalled()
  })
})
