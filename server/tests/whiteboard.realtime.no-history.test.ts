/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

export {}

import { createWhiteboardMessageHandler } from '../realtime/whiteboard'

type MockDb = (tableName: string) => {
  where: (conditions: Record<string, string>) => { first: () => Promise<unknown> }
}

describe('whiteboard realtime join', () => {
  test('does not replay history on join', async () => {
    const db: MockDb = (tableName: string) => {
      if (tableName !== 'room_members') {
        throw new Error(`Unexpected table: ${tableName}`)
      }
      return {
        where: () => ({
          first: () => Promise.resolve({ id: 1 }),
        }),
      }
    }

    const handler = createWhiteboardMessageHandler({ db })

    const send = jest.fn()
    const joinRoom = jest.fn().mockReturnValue({ ok: true, roomId: 'room-1' })
    const leaveRoom = jest.fn().mockReturnValue({ ok: true })
    const publishToRoom = jest.fn().mockReturnValue({ delivered: 0 })

    const record = {
      id: 'socket-1',
      userId: 'user-1',
      rooms: new Set<string>(),
    }

    const message = {
      type: 'whiteboard:join',
      payload: { boardId: '11111111-1111-4111-8111-111111111111', cursor: { lastSeq: 12 } },
    }

    await handler({
      record,
      message,
      send,
      joinRoom,
      leaveRoom,
      publishToRoom,
    })

    expect(send).toHaveBeenCalledWith('whiteboard:joined', { payload: { boardId: message.payload.boardId } })

    const historyEvents = send.mock.calls.filter(([type]) =>
      type === 'stroke:start' || type === 'stroke:move' || type === 'stroke:end',
    )
    expect(historyEvents.length).toBe(0)
  })
})
