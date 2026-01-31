/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

export {}

import { createWhiteboardMessageHandler } from '../realtime/whiteboard'

type InsertBuilder = {
  onConflict: (columns: string[]) => InsertBuilder
  ignore: () => InsertBuilder
  then: <T>(resolve: (value: Array<{ id: number }>) => T, reject?: (err: unknown) => void) => Promise<T>
}

describe('whiteboard realtime rate limiting', () => {
  test('rejects events that exceed the rate limit window', async () => {
    const createInsertBuilder = (): InsertBuilder => {
      const builder: InsertBuilder = {
        onConflict: () => builder,
        ignore: () => builder,
        then: async (resolve, reject) => {
          try {
            return resolve([{ id: 1 }])
          } catch (err) {
            if (reject) reject(err)
            throw err
          }
        },
      }
      return builder
    }

    const db = (tableName: string) => {
      if (tableName === 'room_members') {
        return {
          where: () => ({
            first: () => Promise.resolve({ id: 1 }),
          }),
        }
      }

      if (tableName === 'whiteboard_events') {
        return {
          insert: () => createInsertBuilder(),
        }
      }

      throw new Error(`Unexpected table: ${tableName}`)
    }

    const handler = createWhiteboardMessageHandler({ db: db as any })
    const send = jest.fn()
    const joinRoom = jest.fn().mockReturnValue({ ok: true, roomId: 'room-1' })
    const leaveRoom = jest.fn().mockReturnValue({ ok: true })
    const publishToRoom = jest.fn().mockReturnValue({ delivered: 1 })

    const record = {
      id: 'socket-1',
      userId: 'user-1',
      rooms: new Set<string>(['11111111-1111-4111-8111-111111111111']),
    }

    const message = {
      type: 'stroke:move',
      payload: {
        boardId: '11111111-1111-4111-8111-111111111111',
        strokeId: 'stroke-1',
        segmentIndex: 0,
        x: 0.2,
        y: 0.3,
        t: 123,
      },
    }

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000)

    for (let i = 0; i < 241; i += 1) {
      await handler({ record, message, send, joinRoom, leaveRoom, publishToRoom })
    }

    const rateLimited = send.mock.calls.filter(
      ([type, payload]) =>
        type === 'whiteboard:error' &&
        payload &&
        typeof payload === 'object' &&
        'payload' in payload &&
        (payload as { payload?: { code?: string } }).payload?.code === 'rate_limited',
    )

    expect(rateLimited.length).toBe(1)

    nowSpy.mockRestore()
  })
})
