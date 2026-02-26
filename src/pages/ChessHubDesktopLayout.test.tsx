import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Bot } from 'lucide-react'
import type { GameWithMembers } from '../api/games'
import ChessHubDesktopLayout from './ChessHubDesktopLayout'

vi.mock('./GreatestGamesCard', () => ({
  default: () => <div data-testid="gotw-card">Greatest Games</div>,
}))

const modeItems = [
  {
    key: 'local',
    title: 'Play Computer',
    description: 'Practice against the computer.',
    chips: ['Engine'],
    imageSrc: '/chess-hub/human_vs_computer_chess.webp',
    imageAlt: 'Play computer artwork',
    onClick: vi.fn(),
    icon: Bot,
  },
]

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

describe('ChessHubDesktopLayout', () => {
  it('renders the Greatest Games card in the right rail', () => {
    render(
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
      />,
    )

    expect(screen.getByTestId('gotw-card')).toBeInTheDocument()
  })
})
