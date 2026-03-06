import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock, maybeSingleMock, fromMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn()
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))

  return {
    requestMock: vi.fn(),
    maybeSingleMock,
    eqMock,
    selectMock,
    fromMock,
  }
})

vi.mock('./httpClient', () => ({
  request: (...args: unknown[]) => requestMock(...args),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: fromMock,
  },
}))

import { createWhiteboard, getWhiteboardSessionDetails } from './whiteboards'
import { supabase } from '../supabaseClient'

const getUserMock = vi.mocked(supabase.auth.getUser)

describe('getWhiteboardSessionDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } as any },
      error: null,
    })
  })

  it('returns backend room details when the API succeeds', async () => {
    requestMock.mockResolvedValueOnce({
      id: 'board-1',
      name: 'API Board',
      created_by: 'user-1',
      created_at: '2026-03-06T00:00:00.000Z',
      updated_at: '2026-03-06T01:00:00.000Z',
    })

    await expect(getWhiteboardSessionDetails('board-1')).resolves.toMatchObject({
      id: 'board-1',
      name: 'API Board',
    })

    expect(fromMock).not.toHaveBeenCalled()
  })

  it('falls back to Supabase room details when the API fails', async () => {
    requestMock.mockRejectedValueOnce(new Error('backend unavailable'))
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        id: 'board-1',
        name: 'Fallback Board',
        created_by: 'user-1',
        created_at: '2026-03-06T00:00:00.000Z',
        updated_at: '2026-03-06T01:00:00.000Z',
      },
      error: null,
    })

    await expect(getWhiteboardSessionDetails('board-1')).resolves.toMatchObject({
      id: 'board-1',
      name: 'Fallback Board',
      created_by: 'user-1',
    })

    expect(fromMock).toHaveBeenCalledWith('rooms')
  })

  it('creates new boards with the Untitled default name', async () => {
    const roomSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'board-2',
        name: 'Untitled',
        is_group: true,
        created_at: '2026-03-06T00:00:00.000Z',
        type: 'whiteboard',
        metadata: {},
      },
      error: null,
    })
    const roomSelectMock = vi.fn(() => ({ single: roomSingleMock }))
    const insertMock = vi.fn(() => ({ select: roomSelectMock }))
    const memberInsertMock = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation(((table: string) => {
      if (table === 'rooms') {
        return { insert: insertMock }
      }
      if (table === 'room_members') {
        return { insert: memberInsertMock }
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })) })) }
    }) as any)

    await expect(createWhiteboard()).resolves.toMatchObject({
      id: 'board-2',
      name: 'Untitled',
    })

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Untitled' }))
  })
})