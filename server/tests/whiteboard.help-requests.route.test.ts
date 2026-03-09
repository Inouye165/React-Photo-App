/* eslint-env jest */

import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const mockSupabaseInsert = jest.fn(async () => ({ error: null }))
const mockFrom = jest.fn((tableName: string) => {
  if (tableName === 'room_members') {
    return {
      insert: mockSupabaseInsert,
    }
  }

  throw new Error(`Unexpected supabase table: ${tableName}`)
})

jest.mock('../lib/supabaseClient', () => ({
  from: mockFrom,
}))

const createWhiteboardRouter = require('../routes/whiteboard')

type HelpRequestRow = {
  id: string
  board_id: string
  student_user_id: string
  claimed_by_user_id: string | null
  status: 'pending' | 'claimed' | 'resolved' | 'cancelled'
  request_text: string | null
  problem_draft: string | null
  created_at: string
  updated_at: string
  claimed_at: string | null
  resolved_at: string | null
  board_name?: string | null
  student_username?: string | null
  claimed_by_username?: string | null
}

type RoomMemberRow = {
  room_id: string
  user_id: string
  is_owner: boolean
}

type MockDbState = {
  helpRequests: HelpRequestRow[]
  roomMembers: RoomMemberRow[]
  users: string[]
}

type RequestWithUser = Request & {
  user?: {
    id?: string
    isTutor?: boolean
  }
}

function createMockDb(state: MockDbState) {
  const makeTableQuery = (tableName: string) => {
    if (tableName === 'users') {
      const query: any = {
        _insertRow: null as { id: string } | null,
        insert: jest.fn(function insert(row: { id: string }) {
          query._insertRow = row
          return query
        }),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn(async () => {
          if (!query._insertRow?.id) return
          if (!state.users.includes(query._insertRow.id)) {
            state.users.push(query._insertRow.id)
          }
        }),
      }
      return query
    }

    if (tableName === 'room_members') {
      const query: any = {
        _where: {} as Record<string, unknown>,
        _insertRow: null as RoomMemberRow | null,
        where: jest.fn(function where(conditions: Record<string, unknown>) {
          Object.assign(query._where, conditions)
          return query
        }),
        first: jest.fn(async () => {
          const row = state.roomMembers.find(
            (member) => member.room_id === query._where.room_id && member.user_id === query._where.user_id,
          )
          return row ?? null
        }),
        insert: jest.fn(function insert(row: RoomMemberRow) {
          query._insertRow = row
          return query
        }),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn(async () => {
          if (!query._insertRow) return

          if (query._insertRow.user_id === 'tutor-2') {
            const error = new Error(
              'insert or update on table "room_members" violates foreign key constraint "room_members_user_id_foreign"',
            ) as Error & { code?: string; constraint?: string }
            error.code = '23503'
            error.constraint = 'room_members_user_id_foreign'
            throw error
          }

          const exists = state.roomMembers.some(
            (member) => member.room_id === query._insertRow?.room_id && member.user_id === query._insertRow?.user_id,
          )
          if (!exists) {
            state.roomMembers.push(query._insertRow)
          }
        }),
      }
      return query
    }

    if (tableName === 'whiteboard_help_requests') {
      const query: any = {
        _where: {} as Record<string, unknown>,
        where: jest.fn(function where(conditions: Record<string, unknown>) {
          Object.assign(query._where, conditions)
          return query
        }),
        update: jest.fn(async (changes: Partial<HelpRequestRow>) => {
          const row = state.helpRequests.find((helpRequest) => helpRequest.id === query._where.id)
          if (!row) return 0
          Object.assign(row, changes)
          return 1
        }),
      }
      return query
    }

    if (tableName === 'whiteboard_help_requests as hr') {
      const query: any = {
        _where: {} as Record<string, unknown>,
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn(function where(column: Record<string, unknown> | string, value?: unknown) {
          if (typeof column === 'string') {
            query._where[column] = value
            return query
          }

          Object.assign(query._where, column)
          return query
        }),
        whereIn: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn(async () => {
          const requestId = String(query._where['hr.id'] ?? '')
          const row = state.helpRequests.find((helpRequest) => helpRequest.id === requestId)
          if (!row) return null

          return {
            ...row,
            board_name: row.board_name ?? 'Board 1',
            student_username: row.student_username ?? 'student-1',
            claimed_by_username: row.claimed_by_user_id ? 'Tutor Two' : null,
          }
        }),
      }
      return query
    }

    throw new Error(`Unexpected table: ${tableName}`)
  }

  const db: any = jest.fn((tableName: string) => makeTableQuery(tableName))
  db.fn = {
    now: () => new Date('2026-03-08T20:00:00.000Z'),
  }
  db.transaction = jest.fn(async (callback: (trx: any) => Promise<void>) => {
    const trx: any = (tableName: string) => makeTableQuery(tableName)
    trx.fn = db.fn
    await callback(trx)
  })
  return db
}

function createTestApp(db: ReturnType<typeof createMockDb>) {
  const app = express()
  app.use(express.json())

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const withUser = req as RequestWithUser
    withUser.user = { id: 'tutor-2', isTutor: true }
    next()
  })

  app.use('/api/whiteboards', createWhiteboardRouter({ db }))
  return app
}

describe('whiteboard help request routes', () => {
  const boardId = '11111111-1111-4111-8111-111111111111'
  const requestId = '22222222-2222-4222-8222-222222222222'

  beforeEach(() => {
    mockFrom.mockClear()
    mockSupabaseInsert.mockClear()
    mockSupabaseInsert.mockResolvedValue({ error: null })
  })

  test('claims help request when local room_members insert hits auth FK and Supabase fallback succeeds', async () => {
    const state: MockDbState = {
      helpRequests: [
        {
          id: requestId,
          board_id: boardId,
          student_user_id: 'student-1',
          claimed_by_user_id: null,
          status: 'pending',
          request_text: 'Need help with fractions',
          problem_draft: null,
          created_at: '2026-03-08T19:55:00.000Z',
          updated_at: '2026-03-08T19:55:00.000Z',
          claimed_at: null,
          resolved_at: null,
        },
      ],
      roomMembers: [],
      users: [],
    }
    const db = createMockDb(state)
    const app = createTestApp(db)

    const res = await request(app).post(`/api/whiteboards/help-requests/${requestId}/claim`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('claimed')
    expect(res.body.claimedByUserId).toBe('tutor-2')
    expect(mockFrom).toHaveBeenCalledWith('room_members')
    expect(mockSupabaseInsert).toHaveBeenCalledWith({ room_id: boardId, user_id: 'tutor-2', is_owner: false })
    expect(state.helpRequests[0]?.status).toBe('claimed')
    expect(state.helpRequests[0]?.claimed_by_user_id).toBe('tutor-2')
  })
})