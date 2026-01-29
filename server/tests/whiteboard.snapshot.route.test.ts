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
  where: (conditions: { room_id: string; user_id: string }) => RoomMemberQuery
  first: () => Promise<RoomMember | null>
}

type WhiteboardEventsQuery = {
  select: (...columns: string[]) => WhiteboardEventsQuery
  where: (column: string, value: string) => WhiteboardEventsQuery
  orderBy: (column: string, direction?: 'asc' | 'desc') => WhiteboardEventsQuery
  limit: (value: number) => WhiteboardEventsQuery
  then: <T>(resolve: (rows: WhiteboardEventRow[]) => T) => Promise<T>
  _rows: WhiteboardEventRow[]
}

function createMockDb(state: MockDbState) {
  const db = ((tableName: string) => {
    if (tableName === 'room_members') {
      let conditions: { room_id: string; user_id: string } | null = null
      const query: RoomMemberQuery = {
        where: (nextConditions) => {
          conditions = nextConditions
          return query
        },
        first: async () => {
          if (!conditions) return null
          return (
            state.roomMembers.find(
              (member) => member.room_id === conditions?.room_id && member.user_id === conditions?.user_id,
            ) || null
          )
        },
      }
      return query
    }

    if (tableName === 'whiteboard_events') {
      const query: WhiteboardEventsQuery = {
        _rows: [...state.events],
        select: () => query,
        where: (column, value) => {
          if (column === 'board_id') {
            query._rows = state.events.filter((row) => row.board_id === value)
          }
          return query
        },
        orderBy: (_column, direction = 'asc') => {
          query._rows = [...query._rows].sort((a, b) => (direction === 'desc' ? b.id - a.id : a.id - b.id))
          return query
        },
        limit: (value) => {
          query._rows = query._rows.slice(0, value)
          return query
        },
        then: async (resolve) => resolve(query._rows),
      }
      return query
    }

    throw new Error(`Unexpected table: ${tableName}`)
  }) as (tableName: string) => RoomMemberQuery | WhiteboardEventsQuery

  return db
}

type RequestWithUser = Request & { user?: { id?: string } }

function createTestApp({ db, authMode }: { db: ReturnType<typeof createMockDb>; authMode: AuthMode }) {
  const app = express()
  app.use(express.json())

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authMode !== 'unauthorized') {
      const withUser = req as RequestWithUser
      withUser.user = { id: 'user-1' }
    }
    next()
  })

  app.use('/api/whiteboard', createWhiteboardRouter({ db }))

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' })
  })

  return app
}

describe('whiteboard snapshot route', () => {
  const boardId = '11111111-1111-4111-8111-111111111111'

  test('rejects unauthenticated requests (401)', async () => {
    const db = createMockDb({ roomMembers: [], events: [] })
    const app = createTestApp({ db, authMode: 'unauthorized' })

    const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
    expect(res.status).toBe(401)
  })

  test('denies access when user is not a member (404)', async () => {
    const db = createMockDb({ roomMembers: [], events: [] })
    const app = createTestApp({ db, authMode: 'forbidden' })

    const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)
    expect(res.status).toBe(404)
  })

  test('returns ordered events for authorized users', async () => {
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
    const res = await request(app).get(`/api/whiteboard/${boardId}/snapshot`)

    expect(res.status).toBe(200)
    expect(res.body.boardId).toBe(boardId)
    expect(Array.isArray(res.body.events)).toBe(true)
    expect(res.body.events.length).toBe(2)
    expect(res.body.events[0].type).toBe('stroke:start')
    expect(res.body.events[1].type).toBe('stroke:move')
    expect(res.body.cursor).toEqual({ lastSeq: 2, lastTs: null })
  })
})
