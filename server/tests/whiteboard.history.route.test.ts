/* eslint-env jest */

import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const createWhiteboardRouter = require('../routes/whiteboard')

type RoomMember = { room_id: string; user_id: string }
type WhiteboardEventRow = {
  id: number
  board_id: string
  event_type: 'stroke:start' | 'stroke:move' | 'stroke:end'
  stroke_id: string
  x: number
  y: number
  t: number
  source_id: string | null
  color: string | null
  width: number | null
}

type AuthMode = 'ok' | 'unauthorized' | 'forbidden'

type MockDbState = {
  roomMembers: RoomMember[]
  events: WhiteboardEventRow[]
}

type RoomMemberQuery = {
  _where: Record<string, string>
  where: (conditions: Record<string, string>) => RoomMemberQuery
  first: () => Promise<RoomMember | null>
}

type WhiteboardEventsQuery = {
  _where: Record<string, string>
  _limit: number | null
  select: (...columns: string[]) => WhiteboardEventsQuery
  where: (conditions: Record<string, string>) => WhiteboardEventsQuery
  whereColumn: (column: string, value: string) => WhiteboardEventsQuery
  orderBy: (column: string, direction?: 'asc' | 'desc') => WhiteboardEventsQuery
  limit: (value: number) => WhiteboardEventsQuery
  then: (resolve: (rows: WhiteboardEventRow[]) => unknown) => Promise<unknown>
}

function createMockDb(state: MockDbState) {
  const db = jest.fn((tableName: string) => {
    if (tableName === 'room_members') {
      const query: RoomMemberQuery = {
        _where: {},
        where: jest.fn(function where(conditions: Record<string, string>) {
          Object.assign(query._where, conditions)
          return query
        }),
        first: jest.fn().mockImplementation(() => {
          const row = state.roomMembers.find(
            (member) =>
              member.room_id === query._where.room_id && member.user_id === query._where.user_id,
          )
          return Promise.resolve(row ?? null)
        }),
      }
      return query
    }

    if (tableName === 'whiteboard_events') {
      const query: WhiteboardEventsQuery = {
        _where: {},
        _limit: null,
        select: jest.fn().mockReturnThis(),
        where: jest.fn(function where(conditions: Record<string, string>) {
          Object.assign(query._where, conditions)
          return query
        }),
        whereColumn: jest.fn(function whereColumn(column: string, value: string) {
          query._where[column] = value
          return query
        }),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn(function limit(value: number) {
          query._limit = value
          return query
        }),
        then: jest.fn((resolve: (rows: WhiteboardEventRow[]) => unknown) => {
          let rows = state.events.filter((evt) => evt.board_id === query._where.board_id)
          rows = rows.slice().sort((a, b) => a.id - b.id)
          if (typeof query._limit === 'number') {
            rows = rows.slice(0, query._limit)
          }
          return Promise.resolve(resolve(rows))
        }),
      }
      const originalWhere = query.where
      query.where = jest.fn((arg1: string | Record<string, string>, arg2?: string) => {
        if (typeof arg1 === 'string') {
          return query.whereColumn(arg1, String(arg2 ?? ''))
        }
        return originalWhere(arg1)
      }) as WhiteboardEventsQuery['where']
      return query
    }

    throw new Error(`Unexpected table: ${tableName}`)
  })

  return db
}

function createTestApp({ db, authMode }: { db: ReturnType<typeof createMockDb>; authMode: AuthMode }) {
  const app = express()
  app.use(express.json())

  const authMiddleware = (req: Request & { user?: { id?: string } }, res: Response, next: NextFunction) => {
    if (authMode === 'unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    if (authMode === 'forbidden') {
      return res.status(403).json({ success: false, error: 'Invalid token' })
    }
    req.user = { id: 'user-1' }
    return next()
  }

  app.use('/api/whiteboard', authMiddleware, createWhiteboardRouter({ db }))
  return app
}

describe('whiteboard history route', () => {
  const boardId = '11111111-1111-4111-8111-111111111111'

  test('rejects unauthenticated requests (401)', async () => {
    const db = createMockDb({ roomMembers: [], events: [] })
    const app = createTestApp({ db, authMode: 'unauthorized' })

    const res = await request(app).get(`/api/whiteboard/${boardId}/history`)
    expect(res.status).toBe(401)
  })

  test('rejects invalid tokens (403)', async () => {
    const db = createMockDb({ roomMembers: [], events: [] })
    const app = createTestApp({ db, authMode: 'forbidden' })

    const res = await request(app).get(`/api/whiteboard/${boardId}/history`)
    expect(res.status).toBe(403)
  })

  test('returns ordered events with cursor for authorized users', async () => {
    const db = createMockDb({
      roomMembers: [{ room_id: boardId, user_id: 'user-1' }],
      events: [
        {
          id: 2,
          board_id: boardId,
          event_type: 'stroke:move',
          stroke_id: 'stroke-1',
          x: 0.2,
          y: 0.2,
          t: 2,
          source_id: 'user-2',
          color: '#ffffff',
          width: 2,
        },
        {
          id: 1,
          board_id: boardId,
          event_type: 'stroke:start',
          stroke_id: 'stroke-1',
          x: 0.1,
          y: 0.1,
          t: 1,
          source_id: 'user-2',
          color: '#ffffff',
          width: 2,
        },
      ],
    })

    const app = createTestApp({ db, authMode: 'ok' })
    const res = await request(app).get(`/api/whiteboard/${boardId}/history`)

    expect(res.status).toBe(200)
    expect(res.body.boardId).toBe(boardId)
    expect(Array.isArray(res.body.events)).toBe(true)
    expect(res.body.events.length).toBe(2)
    expect(res.body.events[0].type).toBe('stroke:start')
    expect(res.body.events[1].type).toBe('stroke:move')
    expect(res.body.cursor).toEqual({ lastSeq: 2, lastTs: null })
  })

  test('denies access when user is not a member', async () => {
    const db = createMockDb({ roomMembers: [], events: [] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app).get(`/api/whiteboard/${boardId}/history`)
    expect(res.status).toBe(404)
  })
})
