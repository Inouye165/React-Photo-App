/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

export {}

import { createWhiteboardMessageHandler } from '../realtime/whiteboard'

type InsertBuilder = {
  onConflict: () => InsertBuilder
  ignore: () => InsertBuilder
  then: <T>(resolve: (value: Array<{ id: number }>) => T, reject?: (err: unknown) => void) => Promise<T>
}

type WhiteboardQuery = {
  insert: () => InsertBuilder
  select: () => {
    where: () => {
      orderBy: () => {
        first: () => Promise<{ id: number } | null>
      }
      first: () => Promise<{ id: number } | null>
    }
  }
  where: () => {
    first: () => Promise<{ id: number } | null>
  }
}

type WhiteboardDb = (tableName: string) => WhiteboardQuery

const BOARD_ID = '11111111-1111-4111-8111-111111111111'

function createInsertBuilder(): InsertBuilder {
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

function buildQuery(resultId: number | null): WhiteboardQuery {
  return {
    insert: () => createInsertBuilder(),
    select: () => ({
      where: () => ({
        orderBy: () => ({
          first: () => Promise.resolve(resultId !== null ? { id: resultId } : null),
        }),
        first: () => Promise.resolve(resultId !== null ? { id: resultId } : null),
      }),
    }),
    where: () => ({
      first: () => Promise.resolve(resultId !== null ? { id: resultId } : null),
    }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRateLimitedCall(call: unknown[]): boolean {
  const [type, payload] = call
  if (type !== 'whiteboard:error') return false
  if (!isRecord(payload)) return false
  const inner = payload.payload
  if (!isRecord(inner)) return false
  return inner.code === 'rate_limited'
}

describe('whiteboard realtime rate limit', () => {
  test('rejects excessive stroke events with rate_limited error', async () => {
    const db: WhiteboardDb = (tableName) => {
      if (tableName === 'room_members') {
        return buildQuery(1)
      }

      if (tableName === 'whiteboard_events') {
        return buildQuery(1)
      }

      throw new Error(`Unexpected table: ${tableName}`)
    }

    const handler = createWhiteboardMessageHandler({ db })
    const send = jest.fn()
    const joinRoom = jest.fn().mockReturnValue({ ok: true, roomId: BOARD_ID })
    const leaveRoom = jest.fn().mockReturnValue({ ok: true })
    const publishToRoom = jest.fn().mockReturnValue({ delivered: 1 })

    const record = {
      id: 'socket-1',
      userId: 'user-1',
      rooms: new Set<string>([BOARD_ID]),
    }

    const message = {
      type: 'stroke:move',
      payload: {
        boardId: BOARD_ID,
        strokeId: 'stroke-1',
        x: 0.2,
        y: 0.3,
        t: 123,
      },
    }

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(123456)

    for (let i = 0; i < 260; i += 1) {
      await handler({ record, message, send, joinRoom, leaveRoom, publishToRoom })
    }

    nowSpy.mockRestore()

    const rateLimited = send.mock.calls.some((call) => isRateLimitedCall(call))
    expect(rateLimited).toBe(true)
  })
})