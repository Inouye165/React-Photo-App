/* eslint-env jest */

import { createHash } from 'crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const mockMaybeSingle = jest.fn(async () => ({ data: null, error: null }))
const mockEq = jest.fn(function eq() {
  return { maybeSingle: mockMaybeSingle }
})
const mockSelect = jest.fn(function select() {
  return { eq: mockEq }
})
const mockSupabaseInsert = jest.fn(async () => ({ error: null }))
const mockFrom = jest.fn(function from() {
  return {
    select: mockSelect,
    insert: mockSupabaseInsert,
  }
})

jest.mock('../lib/supabaseClient', () => ({
  from: mockFrom,
}))

const createWhiteboardRouter = require('../routes/whiteboard')

type RoomRow = { id: string; created_by: string }
type RoomMemberRow = { room_id: string; user_id: string; is_owner: boolean }
type InviteRow = {
  id: string
  room_id: string
  token_hash: string
  created_by: string
  expires_at: string
  max_uses: number
  uses: number
  revoked_at: string | null
}

type MockDbState = {
  rooms: RoomRow[]
  roomMembers: RoomMemberRow[]
  invites: InviteRow[]
}

type RequestWithUser = Request & { user?: { id?: string } }

function createMockDb(state: MockDbState) {
  const db = ((tableName: string) => {
    if (tableName === 'rooms') {
      const query = {
        _where: {} as Record<string, unknown>,
        _insertRow: null as { id: string } | null,
        select: jest.fn().mockReturnThis(),
        where: jest.fn(function where(conditions: Record<string, unknown>) {
          Object.assign(query._where, conditions)
          return query
        }),
        first: jest.fn(async () => {
          const row = state.rooms.find((room) => room.id === query._where.id)
          return row ?? null
        }),
        insert: jest.fn(function insert(row: { id: string }) {
          query._insertRow = row
          return query
        }),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn(async () => {
          if (!query._insertRow) return
          const exists = state.rooms.some((room) => room.id === query._insertRow?.id)
          if (!exists) {
            state.rooms.push({ id: query._insertRow.id, created_by: 'hydrated-owner' })
          }
        }),
      }
      return query
    }

    if (tableName === 'room_members') {
      const query = {
        _where: {} as Record<string, unknown>,
        _insertRow: null as RoomMemberRow | null,
        _forceUserFkError: false,
        where: jest.fn(function where(conditions: Record<string, unknown>) {
          Object.assign(query._where, conditions)
          return query
        }),
        first: jest.fn(async () => {
          const row = state.roomMembers.find((member) => {
            return Object.entries(query._where).every(([key, value]) => {
              return (member as Record<string, unknown>)[key] === value
            })
          })
          return row ?? null
        }),
        insert: jest.fn(function insert(row: RoomMemberRow) {
          query._insertRow = row
          if (row.user_id === 'force-fk-user-missing') {
            query._forceUserFkError = true
          }
          return query
        }),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn(async () => {
          if (!query._insertRow) return
          if (query._forceUserFkError) {
            const error = new Error('insert or update on table "room_members" violates foreign key constraint "room_members_user_id_foreign"') as Error & {
              code?: string
              constraint?: string
            }
            error.code = '23503'
            error.constraint = 'room_members_user_id_foreign'
            throw error
          }
          const roomExists = state.rooms.some((room) => room.id === query._insertRow?.room_id)
          if (!roomExists) {
            const error = new Error('insert or update on table "room_members" violates foreign key constraint "room_members_room_id_foreign"') as Error & {
              code?: string
              constraint?: string
            }
            error.code = '23503'
            error.constraint = 'room_members_room_id_foreign'
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

    if (tableName === 'whiteboard_invites') {
      const query = {
        _where: {} as Record<string, unknown>,
        _whereNull: [] as string[],
        _expiryAfter: null as Date | null,
        _needsUsesLessThanMax: false,
        where: jest.fn(function where(arg1: Record<string, unknown> | string, arg2?: unknown, arg3?: unknown) {
          if (typeof arg1 === 'string') {
            if (arg2 === '>' && arg1 === 'expires_at' && arg3 instanceof Date) {
              query._expiryAfter = arg3
            }
            return query
          }
          Object.assign(query._where, arg1)
          return query
        }),
        whereNull: jest.fn(function whereNull(column: string) {
          query._whereNull.push(column)
          return query
        }),
        andWhere: jest.fn(function andWhere(column: string, operator: string, value: unknown) {
          if (column === 'expires_at' && operator === '>' && value instanceof Date) {
            query._expiryAfter = value
          }
          return query
        }),
        andWhereRaw: jest.fn(function andWhereRaw(raw: string) {
          if (raw.includes('uses < max_uses')) query._needsUsesLessThanMax = true
          return query
        }),
        first: jest.fn(async () => {
          const row = state.invites.find((invite) => {
            return Object.entries(query._where).every(([key, value]) => {
              return (invite as Record<string, unknown>)[key] === value
            })
          })
          return row ?? null
        }),
        insert: jest.fn(async (row: Omit<InviteRow, 'id' | 'revoked_at'> & { revoked_at?: string | null }) => {
          const next: InviteRow = {
            id: `invite-${state.invites.length + 1}`,
            revoked_at: null,
            ...row,
            expires_at: new Date(row.expires_at).toISOString(),
          }
          state.invites.push(next)
        }),
        increment: jest.fn(async (column: string, by: number) => {
          const matches = state.invites.filter((invite) => {
            const whereMatch = Object.entries(query._where).every(([key, value]) => {
              return (invite as Record<string, unknown>)[key] === value
            })
            if (!whereMatch) return false

            const notNullMatch = query._whereNull.every((columnName) => {
              return (invite as Record<string, unknown>)[columnName] == null
            })
            if (!notNullMatch) return false

            if (query._expiryAfter) {
              if (new Date(invite.expires_at).getTime() <= query._expiryAfter.getTime()) return false
            }

            if (query._needsUsesLessThanMax && !(invite.uses < invite.max_uses)) return false

            return true
          })

          matches.forEach((invite) => {
            if (column === 'uses') {
              invite.uses += by
            }
          })

          return matches.length
        }),
      }
      return query
    }

    throw new Error(`Unexpected table: ${tableName}`)
  }) as ((tableName: string) => any) & { fn: { now: () => Date } }

  db.fn = {
    now: () => new Date(),
  }

  return db
}

function createTestApp(db: ReturnType<typeof createMockDb>) {
  const app = express()
  app.use(express.json())

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const withUser = req as RequestWithUser
    withUser.user = { id: String(req.headers['x-test-user-id'] || 'owner-1') }
    next()
  })

  app.use('/api/whiteboards', createWhiteboardRouter({ db }))
  return app
}

describe('whiteboard invites routes', () => {
  const boardId = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    mockMaybeSingle.mockReset()
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockFrom.mockClear()
    mockSelect.mockClear()
    mockEq.mockClear()
    mockSupabaseInsert.mockReset()
    mockSupabaseInsert.mockResolvedValue({ error: null })
  })

  test('owner can create invite', async () => {
    const state: MockDbState = {
      rooms: [{ id: boardId, created_by: 'owner-1' }],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [],
    }
    const app = createTestApp(createMockDb(state))

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/invites`)
      .set('x-test-user-id', 'owner-1')

    expect(res.status).toBe(201)
    expect(typeof res.body.joinUrl).toBe('string')
    expect(res.body.joinUrl).toContain(`/whiteboards/${boardId}/join`)
    expect(res.body.joinUrl).toContain('token=')
    expect(typeof res.body.expiresAt).toBe('string')
    expect(state.invites).toHaveLength(1)
    expect(state.invites[0].token_hash).not.toContain('/whiteboards/join/')
    expect(state.invites[0].uses).toBe(0)
    expect(state.invites[0].max_uses).toBe(1)
  })

  test('non-owner cannot create invite (403)', async () => {
    const state: MockDbState = {
      rooms: [{ id: boardId, created_by: 'owner-1' }],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [],
    }
    const app = createTestApp(createMockDb(state))

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/invites`)
      .set('x-test-user-id', 'not-owner')

    expect(res.status).toBe(403)
    expect(state.invites).toHaveLength(0)
  })

  test('invite creation returns 404 when room row is missing', async () => {
    const state: MockDbState = {
      rooms: [],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [],
    }
    const app = createTestApp(createMockDb(state))

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/invites`)
      .set('x-test-user-id', 'owner-1')

    expect(res.status).toBe(404)
    expect(res.body.reason).toBe('room_not_found')
    expect(state.invites).toHaveLength(0)
  })

  test('invite creation hydrates room from supabase and succeeds', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: boardId },
      error: null,
    })

    const state: MockDbState = {
      rooms: [],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [],
    }
    const app = createTestApp(createMockDb(state))

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/invites`)
      .set('x-test-user-id', 'owner-1')

    expect(res.status).toBe(201)
    expect(typeof res.body.joinUrl).toBe('string')
    expect(state.rooms.some((room) => room.id === boardId)).toBe(true)
    expect(state.invites).toHaveLength(1)
  })

  test('join hydrates missing room from supabase and succeeds', async () => {
    const rawToken = 'valid-token-value'
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: boardId, created_by: 'owner-1' },
      error: null,
    })

    const state: MockDbState = {
      rooms: [],
      roomMembers: [],
      invites: [
        {
          id: 'invite-active',
          room_id: boardId,
          token_hash: tokenHash,
          created_by: 'owner-1',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          max_uses: 1,
          uses: 0,
          revoked_at: null,
        },
      ],
    }
    const app = createTestApp(createMockDb(state))

    const res = await request(app)
      .post('/api/whiteboards/join')
      .set('x-test-user-id', 'invitee-2')
      .send({ token: rawToken })

    expect(res.status).toBe(200)
    expect(res.body.roomId).toBe(boardId)
    expect(state.rooms.some((room) => room.id === boardId)).toBe(true)
  })

  test('invitee can join and becomes a member', async () => {
    const state: MockDbState = {
      rooms: [{ id: boardId, created_by: 'owner-1' }],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [],
    }
    const app = createTestApp(createMockDb(state))

    const createRes = await request(app)
      .post(`/api/whiteboards/${boardId}/invites`)
      .set('x-test-user-id', 'owner-1')

    const token = new URL(createRes.body.joinUrl).searchParams.get('token') || ''
    const joinRes = await request(app)
      .post('/api/whiteboards/join')
      .set('x-test-user-id', 'invitee-2')
      .send({ token })

    expect(joinRes.status).toBe(200)
    expect(joinRes.body.roomId).toBe(boardId)

    const member = state.roomMembers.find((row) => row.room_id === boardId && row.user_id === 'invitee-2')
    expect(member).toBeTruthy()
    expect(member?.is_owner).toBe(false)
  })

  test('join falls back to supabase membership when local user FK is missing', async () => {
    const state: MockDbState = {
      rooms: [{ id: boardId, created_by: 'owner-1' }],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [],
    }
    const app = createTestApp(createMockDb(state))

    const createRes = await request(app)
      .post(`/api/whiteboards/${boardId}/invites`)
      .set('x-test-user-id', 'owner-1')

    const token = new URL(createRes.body.joinUrl).searchParams.get('token') || ''
    const joinRes = await request(app)
      .post('/api/whiteboards/join')
      .set('x-test-user-id', 'force-fk-user-missing')
      .send({ token })

    expect(joinRes.status).toBe(200)
    expect(joinRes.body.roomId).toBe(boardId)
    expect(mockSupabaseInsert).toHaveBeenCalled()
  })

  test('token cannot be used after max_uses is reached', async () => {
    const state: MockDbState = {
      rooms: [{ id: boardId, created_by: 'owner-1' }],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [],
    }
    const app = createTestApp(createMockDb(state))

    const createRes = await request(app)
      .post(`/api/whiteboards/${boardId}/invites`)
      .set('x-test-user-id', 'owner-1')

    const token = new URL(createRes.body.joinUrl).searchParams.get('token') || ''

    const firstJoin = await request(app)
      .post('/api/whiteboards/join')
      .set('x-test-user-id', 'invitee-2')
      .send({ token })
    expect(firstJoin.status).toBe(200)

    const secondJoin = await request(app)
      .post('/api/whiteboards/join')
      .set('x-test-user-id', 'invitee-3')
      .send({ token })
    expect(secondJoin.status).toBe(400)
    expect(secondJoin.body.reason).toBe('used_up')
  })

  test('re-joining with same used token succeeds if user is already a member', async () => {
    const state: MockDbState = {
      rooms: [{ id: boardId, created_by: 'owner-1' }],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [],
    }
    const app = createTestApp(createMockDb(state))

    const createRes = await request(app)
      .post(`/api/whiteboards/${boardId}/invites`)
      .set('x-test-user-id', 'owner-1')

    const token = new URL(createRes.body.joinUrl).searchParams.get('token') || ''

    const firstJoin = await request(app)
      .post('/api/whiteboards/join')
      .set('x-test-user-id', 'invitee-2')
      .send({ token })
    expect(firstJoin.status).toBe(200)

    const retryJoin = await request(app)
      .post('/api/whiteboards/join')
      .set('x-test-user-id', 'invitee-2')
      .send({ token })
    expect(retryJoin.status).toBe(200)
    expect(retryJoin.body.roomId).toBe(boardId)
  })

  test('expired token fails', async () => {
    const rawToken = 'expired-token-value'
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    const state: MockDbState = {
      rooms: [{ id: boardId, created_by: 'owner-1' }],
      roomMembers: [{ room_id: boardId, user_id: 'owner-1', is_owner: true }],
      invites: [
        {
          id: 'invite-expired',
          room_id: boardId,
          token_hash: tokenHash,
          created_by: 'owner-1',
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          max_uses: 1,
          uses: 0,
          revoked_at: null,
        },
      ],
    }
    const app = createTestApp(createMockDb(state))

    const res = await request(app)
      .post('/api/whiteboards/join')
      .set('x-test-user-id', 'invitee-2')
      .send({ token: rawToken })

    expect(res.status).toBe(400)
    expect(res.body.reason).toBe('expired')
  })
})
