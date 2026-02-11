// @ts-nocheck
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ChessGame from './ChessGame'

let mockGameId = 'game-123'

vi.mock('react-router-dom', () => ({
  useParams: () => ({ gameId: mockGameId }),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

const useGameRealtimeMock = vi.fn(() => ({
  moves: [
    { ply: 1, uci: 'e2e4', created_by: 'user-1', created_at: '2026-02-10T00:00:00Z' },
    { ply: 2, uci: 'e7e5', created_by: 'user-2', created_at: '2026-02-10T00:00:01Z' },
  ],
  loading: false,
}))

vi.mock('../hooks/useGameRealtime', () => ({
  useGameRealtime: useGameRealtimeMock,
}))

const fetchGameMock = vi.fn(async () => ({
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
}))

const fetchGameMembersMock = vi.fn(async () => ([
  { user_id: 'user-1', role: 'white', username: 'alice' },
  { user_id: 'user-2', role: 'black', username: 'bob' },
]))

const makeMoveMock = vi.fn(async () => ({}))
const restartGameMock = vi.fn(async () => ({}))

vi.mock('../api/games', () => ({
  fetchGame: fetchGameMock,
  fetchGameMembers: fetchGameMembersMock,
  makeMove: makeMoveMock,
  restartGame: restartGameMock,
}))

vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    isReady: true,
    topMoves: [],
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
  Chessboard: () => <div data-testid="chessboard" />,
}))

describe('ChessGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGameId = 'game-123'
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
    mockGameId = 'local'
    render(<ChessGame />)
    expect(screen.getByText('Chess (Local)')).toBeInTheDocument()
    expect(useGameRealtimeMock).not.toHaveBeenCalled()
    expect(fetchGameMock).not.toHaveBeenCalled()
    expect(fetchGameMembersMock).not.toHaveBeenCalled()
  })
})
