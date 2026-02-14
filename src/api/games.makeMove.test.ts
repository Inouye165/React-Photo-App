import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getUserMock,
  signOutMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  signOutMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
    },
    rpc: vi.fn(),
    from: fromMock,
  },
}))

vi.mock('./chat', () => ({
  searchUsers: vi.fn(),
}))

vi.mock('../events/gamesEvents', () => ({
  notifyGamesChanged: vi.fn(),
}))

async function loadMakeMove() {
  vi.resetModules()
  const mod = await import('./games')
  return mod.makeMove
}

describe('makeMove hint_used compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })

    fromMock.mockImplementation((table: string) => {
      if (table === 'chess_moves') return { insert: insertMock }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('retries without hint_used when column is missing', async () => {
    const makeMove = await loadMakeMove()

    singleMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST204',
          message: "Could not find the 'hint_used' column of 'chess_moves' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: { id: 'm1', ply: 1, uci: 'e2e4', fen_after: 'fen', created_by: 'user-1' },
        error: null,
      })

    const result = await makeMove('game-1', 1, 'e2e4', 'fen', true)

    expect(insertMock).toHaveBeenCalledTimes(2)
    expect(insertMock).toHaveBeenNthCalledWith(1, {
      game_id: 'game-1',
      ply: 1,
      uci: 'e2e4',
      fen_after: 'fen',
      created_by: 'user-1',
      hint_used: true,
    })
    expect(insertMock).toHaveBeenNthCalledWith(2, {
      game_id: 'game-1',
      ply: 1,
      uci: 'e2e4',
      fen_after: 'fen',
      created_by: 'user-1',
    })
    expect(result).toEqual(expect.objectContaining({ id: 'm1', ply: 1 }))
  })

  it('does not retry for unrelated insert errors', async () => {
    const makeMove = await loadMakeMove()

    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })

    await expect(makeMove('game-1', 1, 'e2e4', 'fen', true)).rejects.toEqual(
      expect.objectContaining({ code: '23505' }),
    )
    expect(insertMock).toHaveBeenCalledTimes(1)
  })
})
