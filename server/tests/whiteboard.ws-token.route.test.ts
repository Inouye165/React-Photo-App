/* eslint-env jest */

import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const mockFrom = jest.fn()

jest.mock('../lib/supabaseClient', () => ({
  from: mockFrom,
}))

const createWhiteboardRouter = require('../routes/whiteboard')

type RoomMember = { room_id: string; user_id: string }

type MockDbState = {
  roomMembers: RoomMember[]
}

function createMockDb(state: MockDbState) {
  const db = jest.fn((tableName: string) => {
    if (tableName === 'room_members') {
      const query: any = {
        _where: {},
        where: jest.fn(function where(conditions: Record<string, string>) {
          Object.assign(query._where, conditions)
          return query
        }),
        first: jest.fn().mockImplementation(() => {
          const row = state.roomMembers.find(
            (member) => member.room_id === query._where.room_id && member.user_id === query._where.user_id,
          )
          return Promise.resolve(row ?? null)
        }),
      }
      return query
    }
    throw new Error(`Unexpected table: ${tableName}`)
  })

  return db
}

function createTestApp({ db, authMode }: { db: ReturnType<typeof createMockDb>; authMode: 'ok' | 'unauthorized' | 'forbidden' }) {
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

describe('whiteboard ws-token route', () => {
  const boardId = '11111111-1111-4111-8111-111111111111'
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    mockFrom.mockReset()
  })

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  test('returns ws-ticket for authenticated member', async () => {
    const db = createMockDb({ roomMembers: [{ room_id: boardId, user_id: 'user-1' }] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app).post(`/api/whiteboard/${boardId}/ws-token`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.token.length).toBeGreaterThan(0)
    expect(typeof res.body.expiresInMs).toBe('number')
  })

  test('denies ws-ticket to non-member (404)', async () => {
    const db = createMockDb({ roomMembers: [] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app).post(`/api/whiteboard/${boardId}/ws-token`)
    expect(res.status).toBe(404)
  })

  test('returns ws-ticket for board creator when membership row is not mirrored yet', async () => {
    process.env.NODE_ENV = 'development'

    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'room_members') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        }
      }

      if (tableName === 'rooms') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({ data: { created_by: 'user-1' }, error: null }),
            })),
          })),
        }
      }

      throw new Error(`Unexpected supabase table: ${tableName}`)
    })

    const db = createMockDb({ roomMembers: [] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app).post(`/api/whiteboard/${boardId}/ws-token`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'room_members')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'rooms')
  })
})
