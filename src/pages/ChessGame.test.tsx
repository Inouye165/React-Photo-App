import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChessGame from './ChessGame'

const {
  getMockGameId,
  setMockGameId,
  getAuthUserId,
  setAuthUserId,
  getEngineMoveUci,
  setEngineMoveUci,
  navigateMock,
  useGameRealtimeMock,
  fetchGameMock,
  fetchGameMembersMock,
  makeMoveMock,
  restartGameMock,
  abortGameMock,
  getTopMovesMock,
  setTopMovesMock,
  analyzeGameForMeMock,
} = vi.hoisted(() => {
  let mockGameId = 'game-123'
  let authUserId = 'user-1'
  let engineMoveUci = 'e2e4'
  let topMovesMock = [] as Array<{ uci: string; score: number | null; mate: number | null; depth: number | null }>
  return {
    getMockGameId: () => mockGameId,
    setMockGameId: (value: string) => { mockGameId = value },
    getAuthUserId: () => authUserId,
    setAuthUserId: (value: string) => { authUserId = value },
    getEngineMoveUci: () => engineMoveUci,
    setEngineMoveUci: (value: string) => { engineMoveUci = value },
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
    analyzeGameForMeMock: vi.fn(async () => ({
      analysis: {
        positionSummary: 'Equal position with central tension.',
        hints: ['Develop the kingside pieces.'],
        focusAreas: ['King safety'],
      },
      model: 'gemini-2.0-flash-lite',
      apiVersion: 'v1',
    })),
  }
})

vi.mock('react-router-dom', () => ({
  useParams: () => ({ gameId: getMockGameId() }),
  useNavigate: () => navigateMock,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: getAuthUserId() } }),
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

vi.mock('../api/chessTutor', () => ({
  analyzeGameForMe: analyzeGameForMeMock,
}))

vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    isReady: true,
    topMoves: getTopMovesMock(),
    evaluation: { score: 0, mate: null },
    analyzePosition: vi.fn(),
    getEngineMove: vi.fn(async () => getEngineMoveUci()),
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
  Chessboard: (props: { customSquareStyles?: Record<string, unknown>; boardOrientation?: 'white' | 'black'; onPieceDrop?: (src: 'e2', dst: 'e4') => boolean }) => (
    <div
      data-testid="chessboard"
      data-orientation={props.boardOrientation || 'white'}
      data-custom-squares={Object.keys(props.customSquareStyles ?? {}).sort().join(',')}
    >
      <button type="button" onClick={() => props.onPieceDrop?.('e2', 'e4')}>mock-drop-e2e4</button>
    </div>
  ),
}))

describe('ChessGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setMockGameId('game-123')
    setAuthUserId('user-1')
    setEngineMoveUci('e2e4')
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

  it('highlights hint path after showing hints in local mode', async () => {
    const user = userEvent.setup()
    setMockGameId('local')
    setTopMovesMock([{ uci: 'e2e4', score: 36, mate: null, depth: 14 }])

    render(<ChessGame />)

    const hintShow = screen.getByRole('button', { name: 'Show hints' })
    const board = screen.getByTestId('chessboard')
    expect(board).toHaveAttribute('data-custom-squares', '')

    await user.click(hintShow)

    const hintItem = await screen.findByRole('button', { name: '1. e4' })
    await user.hover(hintItem)

    await waitFor(() => {
      const highlighted = screen.getByTestId('chessboard').getAttribute('data-custom-squares') || ''
      expect(highlighted).toContain('e2')
      expect(highlighted).toContain('e4')
    })
  })

  it('orients board for black player in online mode', async () => {
    setAuthUserId('user-2')
    render(<ChessGame />)

    await waitFor(() => {
      expect(screen.getByTestId('chessboard')).toHaveAttribute('data-orientation', 'black')
    })
  })

  it('jumps to selected ply when clicking move history SAN', async () => {
    const user = userEvent.setup()
    render(<ChessGame />)

    const moveButton = await screen.findByRole('button', { name: 'e4' })
    await user.click(moveButton)

    expect(screen.getByText('Viewing move 1/2')).toBeInTheDocument()
  })

  it('renders newest move row first in move history', async () => {
    useGameRealtimeMock.mockReturnValue({
      moves: [
        { ply: 1, uci: 'e2e4', created_by: 'user-1', created_at: '2026-02-10T00:00:00Z' },
        { ply: 2, uci: 'e7e5', created_by: 'user-2', created_at: '2026-02-10T00:00:01Z' },
        { ply: 3, uci: 'g1f3', created_by: 'user-1', created_at: '2026-02-10T00:00:02Z' },
        { ply: 4, uci: 'b8c6', created_by: 'user-2', created_at: '2026-02-10T00:00:03Z' },
      ],
      loading: false,
    })

    render(<ChessGame />)

    await waitFor(() => {
      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
      const firstBodyRow = rows[1]
      const firstRowScope = within(firstBodyRow as HTMLElement)
      expect(firstRowScope.getByText('2.')).toBeInTheDocument()
      expect(firstRowScope.getByText('Nf3')).toBeInTheDocument()
      expect(firstRowScope.getByText('Nc6')).toBeInTheDocument()
    })
  })

  it('shows controlled-area overlays only when checkbox is checked', async () => {
    const user = userEvent.setup()
    setMockGameId('local')
    render(<ChessGame />)

    const board = screen.getByTestId('chessboard')
    expect(board).toHaveAttribute('data-custom-squares', '')

    await user.click(screen.getByRole('checkbox', { name: 'Highlight controlled area' }))

    await waitFor(() => {
      const highlighted = screen.getByTestId('chessboard').getAttribute('data-custom-squares') || ''
      expect(highlighted.length).toBeGreaterThan(0)
      expect(highlighted).toContain('e3')
    })
  })

  it('disables online hint button when it is not the current user turn', async () => {
    setAuthUserId('user-2')
    render(<ChessGame />)

    const hintButton = await screen.findByRole('button', { name: 'Show hints' })
    expect(hintButton).toBeDisabled()
  })

  it('records black reply in local move history after white move', async () => {
    const user = userEvent.setup()
    setMockGameId('local')
    setEngineMoveUci('e7e5')
    render(<ChessGame />)

    await user.click(screen.getByRole('button', { name: 'mock-drop-e2e4' }))

    await waitFor(() => {
      expect(screen.getByText('e4')).toBeInTheDocument()
      expect(screen.getByText('e5')).toBeInTheDocument()
      expect(screen.queryByText('2.')).not.toBeInTheDocument()
      const firstRow = screen.getByText('1.').closest('tr')
      expect(firstRow).toBeTruthy()
      const rowScope = within(firstRow as HTMLElement)
      expect(rowScope.getByText('e4')).toBeInTheDocument()
      expect(rowScope.getByText('e5')).toBeInTheDocument()
    })
  })

  it('shows the exact tutor model after analyze completes', async () => {
    const user = userEvent.setup()
    setMockGameId('local')
    render(<ChessGame />)

    expect(screen.getByText('gemini')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Analyze game for me' }))

    await waitFor(() => {
      expect(analyzeGameForMeMock).toHaveBeenCalled()
      expect(screen.getByText('gemini-2.0-flash-lite')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'How to play' }))
    expect(screen.getByText('Beginner Lesson')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Analyze game' }))
    expect(screen.getByText('gemini-2.0-flash-lite')).toBeInTheDocument()
  })

  it('shows beginner lesson flow from pawn to knight', async () => {
    const user = userEvent.setup()
    setMockGameId('local')
    render(<ChessGame />)

    await user.click(screen.getByRole('button', { name: 'How to play' }))

    expect(screen.getByText('Piece value: ≈1 point')).toBeInTheDocument()
    expect(screen.getByText('This demo shows a first move push from e2 to e4.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next piece' }))

    expect(screen.getByText('Piece value: ≈3 points')).toBeInTheDocument()
    expect(screen.getByText('This demo shows a knight hop from d4 to f5.')).toBeInTheDocument()
  })

  it('shows chess history timeline with scrollable events and images', async () => {
    const user = userEvent.setup()
    setMockGameId('local')
    render(<ChessGame />)

    await user.click(screen.getByRole('button', { name: 'Chess history' }))

    expect(screen.getByText('Chess History Timeline')).toBeInTheDocument()
    expect(screen.getByText('Early Chaturanga in India')).toBeInTheDocument()
    expect(screen.getByText('Neural-network engine age')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Illustration representing early chaturanga gameplay' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Analyze game' }))
    expect(screen.getByRole('button', { name: 'Analyze game for me' })).toBeInTheDocument()
  })
})
