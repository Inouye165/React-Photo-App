import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChessGame from './ChessGame'

const {
  getMockGameId,
  setMockGameId,
  navigateMock,
  useGameRealtimeMock,
  fetchGameMock,
  fetchGameMembersMock,
  makeMoveMock,
  restartGameMock,
  abortGameMock,
  getTopMovesMock,
  setTopMovesMock,
} = vi.hoisted(() => {
  let mockGameId = 'game-123'
  let topMovesMock = [] as Array<{ uci: string; score: number | null; mate: number | null; depth: number | null }>
  return {
    getMockGameId: () => mockGameId,
    setMockGameId: (value: string) => { mockGameId = value },
    getTopMovesMock: () => topMovesMock,
    setTopMovesMock: (value: Array<{ uci: string; score: number | null; mate: number | null; depth: number | null }>) => {
      topMovesMock = value
    },
    navigateMock: vi.fn(),
    useGameRealtimeMock: vi.fn(() => ({
      moves: [
        { ply: 1, uci: 'e2e4', created_by: 'user-1', created_at: '2026-02-10T00:00:00Z' },
        { ply: 2, uci: 'e7e5', created_by: 'user-2', created_at: '2026-02-10T00:00:01Z' },
      ],
      loading: false,
    })),
    fetchGameMock: vi.fn(async () => ({
      id: 'game-123',
      type: 'chess',
      status: 'active',
      created_by: 'user-1',
      created_at: '2026-02-10T00:00:00Z',
      updated_at: '2026-02-10T00:00:00Z',
      time_control: null,
      current_fen: 'start',
      current_turn: 'w',
      result: null,
    })),
    fetchGameMembersMock: vi.fn(async () => ([
      { user_id: 'user-1', role: 'white', username: 'alice' },
      { user_id: 'user-2', role: 'black', username: 'bob' },
    ])),
    makeMoveMock: vi.fn(async () => ({})),
    restartGameMock: vi.fn(async () => ({})),
    abortGameMock: vi.fn(async () => undefined),
  }
})

vi.mock('react-router-dom', () => ({
  useParams: () => ({ gameId: getMockGameId() }),
  useNavigate: () => navigateMock,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../hooks/useGameRealtime', () => ({
  useGameRealtime: useGameRealtimeMock,
}))

vi.mock('../api/games', () => ({
  fetchGame: fetchGameMock,
  fetchGameMembers: fetchGameMembersMock,
  makeMove: makeMoveMock,
  restartGame: restartGameMock,
  abortGame: abortGameMock,
}))

vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    isReady: true,
    topMoves: getTopMovesMock(),
    evaluation: { score: 0, mate: null },
    analyzePosition: vi.fn(),
    getEngineMove: vi.fn(async () => 'e2e4'),
    difficulty: 'Medium',
    setDifficulty: vi.fn(),
  }),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))

vi.mock('react-chessboard', () => ({
  Chessboard: (props: { customSquareStyles?: Record<string, unknown> }) => (
    <div
      data-testid="chessboard"
      data-custom-squares={Object.keys(props.customSquareStyles ?? {}).sort().join(',')}
    />
  ),
}))

describe('ChessGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setMockGameId('game-123')
    setTopMovesMock([])
  })

  it('renders the board', () => {
    render(<ChessGame />)
    expect(screen.getByTestId('chessboard')).toBeInTheDocument()
  })

  it('renders both player names', async () => {
    render(<ChessGame />)
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
      expect(screen.getByText('bob')).toBeInTheDocument()
    })
  })

  it('renders move history entries', async () => {
    render(<ChessGame />)
    await waitFor(() => {
      expect(screen.getByText('e4')).toBeInTheDocument()
      expect(screen.getByText('e5')).toBeInTheDocument()
    })
  })

  it('local mode does not touch Supabase hooks', () => {
    setMockGameId('local')
    render(<ChessGame />)
    expect(screen.getByText('Chess (Local)')).toBeInTheDocument()
    expect(useGameRealtimeMock).not.toHaveBeenCalled()
    expect(fetchGameMock).not.toHaveBeenCalled()
    expect(fetchGameMembersMock).not.toHaveBeenCalled()
  })

  it('quits online game by aborting and navigating to /games', async () => {
    const user = userEvent.setup()
    render(<ChessGame />)

    const quitButton = await screen.findByRole('button', { name: 'Quit' })
    await user.click(quitButton)

    await waitFor(() => {
      expect(abortGameMock).toHaveBeenCalledWith('game-123')
      expect(navigateMock).toHaveBeenCalledWith('/games')
    })
  })

  it('highlights hint source and destination on hover in local mode', async () => {
    const user = userEvent.setup()
    setMockGameId('local')
    setTopMovesMock([{ uci: 'e2e4', score: 36, mate: null, depth: 14 }])

    render(<ChessGame />)

    const hintButton = screen.getByRole('button', { name: '1. e4' })
    const board = screen.getByTestId('chessboard')
    expect(board).toHaveAttribute('data-custom-squares', '')

    await user.hover(hintButton)

    await waitFor(() => {
      const highlighted = screen.getByTestId('chessboard').getAttribute('data-custom-squares') || ''
      expect(highlighted).toContain('e2')
      expect(highlighted).toContain('e4')
    })

    await user.unhover(hintButton)

    await waitFor(() => {
      expect(screen.getByTestId('chessboard')).toHaveAttribute('data-custom-squares', '')
    })
  })
})
