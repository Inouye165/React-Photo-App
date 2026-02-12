import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getUserMock,
  signOutMock,
  fromMock,
  updateMock,
  eqMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  signOutMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
    },
    from: fromMock,
  },
}))

vi.mock('./chat', () => ({
  searchUsers: vi.fn(),
}))

vi.mock('../events/gamesEvents', () => ({
  notifyGamesChanged: vi.fn(),
}))

import { abortGame } from './games'

describe('abortGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    eqMock.mockResolvedValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ update: updateMock })
  })

  it('updates game status to aborted for the given game id', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    await abortGame('game-123')

    expect(fromMock).toHaveBeenCalledWith('games')
    expect(updateMock).toHaveBeenCalledWith({
      status: 'aborted',
      updated_at: expect.any(String),
    })
    expect(eqMock).toHaveBeenCalledWith('id', 'game-123')
  })

  it('throws when user is not authenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })

    await expect(abortGame('game-123')).rejects.toThrow('Not authenticated')
    expect(fromMock).not.toHaveBeenCalled()
  })
})
