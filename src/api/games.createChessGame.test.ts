import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getUserMock,
  signOutMock,
  rpcMock,
  fromMock,
  gamesInsertMock,
  gamesSelectMock,
  gamesSingleMock,
  membersInsertMock,
  notifyGamesChangedMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  signOutMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  gamesInsertMock: vi.fn(),
  gamesSelectMock: vi.fn(),
  gamesSingleMock: vi.fn(),
  membersInsertMock: vi.fn(),
  notifyGamesChangedMock: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
    },
    rpc: rpcMock,
    from: fromMock,
  },
}))

vi.mock('./chat', () => ({
  searchUsers: vi.fn(),
}))

vi.mock('../events/gamesEvents', () => ({
  notifyGamesChanged: notifyGamesChangedMock,
}))

async function loadCreateChessGame() {
  vi.resetModules()
  const mod = await import('./games')
  return mod.createChessGame
}

describe('createChessGame RPC fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    gamesSingleMock.mockResolvedValue({
      data: {
        id: 'game-1',
        type: 'chess',
        status: 'waiting',
        created_by: 'user-1',
        created_at: '2026-02-12T00:00:00Z',
        updated_at: '2026-02-12T00:00:00Z',
        time_control: null,
        current_fen: 'start-fen',
        current_turn: 'w',
        result: null,
      },
      error: null,
    })
    gamesSelectMock.mockReturnValue({ single: gamesSingleMock })
    gamesInsertMock.mockReturnValue({ select: gamesSelectMock })

    membersInsertMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'games') {
        return { insert: gamesInsertMock }
      }
      if (table === 'game_members') {
        return { insert: membersInsertMock }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('falls back to REST creation when RPC returns 404 not found', async () => {
    const createChessGame = await loadCreateChessGame()
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { status: 404, message: 'Not Found' },
    })

    const game = await createChessGame('user-2', null)

    expect(rpcMock).toHaveBeenCalledWith('create_chess_game', {
      p_created_by: 'user-1',
      p_opponent_id: 'user-2',
    })
    expect(fromMock).toHaveBeenCalledWith('games')
    expect(gamesInsertMock).toHaveBeenCalledWith({ created_by: 'user-1' })
    expect(fromMock).toHaveBeenCalledWith('game_members')
    expect(membersInsertMock).toHaveBeenCalledWith([
      { game_id: 'game-1', user_id: 'user-1', role: 'white' },
      { game_id: 'game-1', user_id: 'user-2', role: 'black' },
    ])
    expect(notifyGamesChangedMock).toHaveBeenCalledTimes(1)
    expect(game.id).toBe('game-1')
  })

  it('skips repeated RPC attempts after first RPC-not-found response', async () => {
    const createChessGame = await loadCreateChessGame()
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { status: 404, message: 'Not Found' },
    })

    await createChessGame('user-2', null)
    await createChessGame('user-3', null)

    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('throws when RPC fails for reasons other than missing function', async () => {
    const createChessGame = await loadCreateChessGame()
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { status: 400, code: 'PGRST301', message: 'permission denied' },
    })

    await expect(createChessGame('user-2', null)).rejects.toEqual(
      expect.objectContaining({ message: 'permission denied' }),
    )
    expect(fromMock).not.toHaveBeenCalledWith('games')
  })
})
