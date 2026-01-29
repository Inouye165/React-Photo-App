/* eslint-env jest */

import type { Knex } from 'knex'
import { createWhiteboardMessageHandler } from '../realtime/whiteboard'

type RoomMembersQuery = {
  where: (conditions: { room_id: string; user_id: string }) => { first: () => Promise<{ id: string } | null> }
}

type MockDb = ((tableName: string) => RoomMembersQuery)

function createMockDb(): MockDb {
  return ((tableName: string) => {
    if (tableName !== 'room_members') {
      throw new Error(`Unexpected table: ${tableName}`)
    }
    return {
      where: () => ({
        first: async () => ({ id: 'room-1' }),
      }),
    }
  }) as MockDb
}

describe('whiteboard realtime join', () => {
  test('does not replay history on join', async () => {
    const db = createMockDb()
    const handler = createWhiteboardMessageHandler({ db: db as unknown as Knex })

    const send = jest.fn()
    const joinRoom = jest.fn().mockReturnValue({ ok: true })
    const leaveRoom = jest.fn()
    const publishToRoom = jest.fn()

    const record = {
      id: 'socket-1',
      userId: 'user-1',
      rooms: new Set<string>(),
    }

    const message = {
      type: 'whiteboard:join',
      payload: { boardId: '11111111-1111-4111-8111-111111111111' },
    }

    await handler({
      record,
      message,
      send,
      joinRoom,
      leaveRoom,
      publishToRoom,
    })

    expect(send).toHaveBeenCalledWith('whiteboard:joined', { boardId: message.payload.boardId })

    const historyEvents = send.mock.calls.filter(([type]) =>
      type === 'stroke:start' || type === 'stroke:move' || type === 'stroke:end',
    )
    expect(historyEvents.length).toBe(0)
  })
})
