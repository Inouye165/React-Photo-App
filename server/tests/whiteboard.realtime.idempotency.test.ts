/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

export {}

import { createWhiteboardMessageHandler } from '../realtime/whiteboard'

type EventRow = {
  id: number
  board_id: string
  stroke_id: string
  segment_index: number | null
}

type InsertRow = {
  board_id: string
  stroke_id: string
  segment_index: number | null
}

type InsertBuilder = {
  onConflict: (columns: string[]) => InsertBuilder
  ignore: () => InsertBuilder
  then: <T>(resolve: (value: Array<{ id: number }>) => T, reject?: (err: unknown) => void) => Promise<T>
}

describe('whiteboard realtime idempotency', () => {
  test('ignores duplicate segments by strokeId and segmentIndex', async () => {
    const events: EventRow[] = []
    let nextId = 1

    const createInsertBuilder = (row: InsertRow): InsertBuilder => {
      let conflictKeys: string[] | null = null
      let ignore = false

      const executeInsert = () => {
        const duplicate =
          conflictKeys?.includes('segment_index') &&
          events.some(
            (evt) =>
              evt.board_id === row.board_id &&
              evt.stroke_id === row.stroke_id &&
              evt.segment_index === row.segment_index,
          )

        if (duplicate && ignore) {
          return []
        }

        const newRow = {
          id: nextId,
          board_id: row.board_id,
          stroke_id: row.stroke_id,
          segment_index: row.segment_index,
        }
        nextId += 1
        events.push(newRow)
        return [{ id: newRow.id }]
      }

      const builder: InsertBuilder = {
        onConflict: (columns) => {
          conflictKeys = columns
          return builder
        },
        ignore: () => {
          ignore = true
          return builder
        },
        then: async (resolve, reject) => {
          try {
            const result = executeInsert()
            return resolve(result)
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
          insert: (row: InsertRow) => createInsertBuilder(row),
          select: () => {
            let whereConditions: Partial<EventRow> = {}
            return {
              where: (conditions: Partial<EventRow>) => {
                whereConditions = { ...whereConditions, ...conditions }
                return {
                  orderBy: () => ({
                    first: () => {
                      const filtered = events.filter((evt) => {
                        if (whereConditions.board_id && evt.board_id !== whereConditions.board_id) return false
                        if (whereConditions.stroke_id && evt.stroke_id !== whereConditions.stroke_id) return false
                        if (typeof whereConditions.segment_index === 'number' && evt.segment_index !== whereConditions.segment_index) {
                          return false
                        }
                        return true
                      })
                      return Promise.resolve(filtered[filtered.length - 1] ?? null)
                    },
                  }),
                  first: () => {
                    const filtered = events.filter((evt) => {
                      if (whereConditions.board_id && evt.board_id !== whereConditions.board_id) return false
                      if (whereConditions.stroke_id && evt.stroke_id !== whereConditions.stroke_id) return false
                      if (typeof whereConditions.segment_index === 'number' && evt.segment_index !== whereConditions.segment_index) {
                        return false
                      }
                      return true
                    })
                    return Promise.resolve(filtered[filtered.length - 1] ?? null)
                  },
                }
              },
            }
          },
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
        segmentIndex: 2,
        x: 0.2,
        y: 0.3,
        t: 123,
      },
    }

    await handler({ record, message, send, joinRoom, leaveRoom, publishToRoom })
    await handler({ record, message, send, joinRoom, leaveRoom, publishToRoom })

    expect(events.length).toBe(1)
    expect(publishToRoom).toHaveBeenCalledTimes(1)
  })
})
