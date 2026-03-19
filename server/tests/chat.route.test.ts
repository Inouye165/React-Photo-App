import express, { type Request } from 'express'
import { describe, expect, jest, test } from '@jest/globals'
import request from 'supertest'

jest.mock('../lib/supabaseClient', () => ({
  from: jest.fn(),
}))

const supabase = require('../lib/supabaseClient')
const createChatRouter = require('../routes/chat')

type RequestWithUser = Request & {
  user?: {
    id?: string
  }
}

type RoomMemberRow = {
  room_id: string
  user_id: string
  is_owner: boolean
}

type MessageRow = {
  id: string
  room_id: string
  sender_id: string
  content: string
  photo_id: number | null
  created_at: string
}

function createMockDb() {
  return ((tableName: string) => {
    throw new Error(`Unexpected table ${tableName}`)
  }) as any
}

function configureSupabaseMock(state: {
  roomMembers: RoomMemberRow[]
  messages: MessageRow[]
}) {
  supabase.from.mockImplementation((tableName: string) => {
    if (tableName === 'room_members') {
      const filters: Record<string, unknown> = {}
      const query: any = {
        select() {
          return query
        },
        eq(column: string, value: unknown) {
          filters[column] = value
          return query
        },
        async maybeSingle() {
          return {
            data:
              state.roomMembers.find(
                (member) => member.room_id === filters.room_id && member.user_id === filters.user_id,
              ) ?? null,
            error: null,
          }
        },
      }
      return query
    }

    if (tableName === 'messages') {
      const query: any = {
        _insertRow: null as Omit<MessageRow, 'id' | 'created_at'> | null,
        insert(row: Omit<MessageRow, 'id' | 'created_at'>) {
          query._insertRow = row
          return query
        },
        select() {
          return query
        },
        async single() {
          const next: MessageRow = {
            id: `message-${state.messages.length + 1}`,
            room_id: String(query._insertRow?.room_id ?? ''),
            sender_id: String(query._insertRow?.sender_id ?? ''),
            content: String(query._insertRow?.content ?? ''),
            photo_id: typeof query._insertRow?.photo_id === 'number' ? query._insertRow.photo_id : null,
            created_at: '2026-03-19T00:00:00.000Z',
          }
          state.messages.push(next)
          return { data: next, error: null }
        },
      }
      return query
    }

    throw new Error(`Unexpected table ${tableName}`)
  })
}

function createTestApp(db: any, userId = 'user-1') {
  const app = express()
  app.use(express.json())
  app.use((req: RequestWithUser, _res, next) => {
    req.user = { id: userId }
    next()
  })
  app.use('/api/v1/chat', createChatRouter({ db }))
  app.use((err: Error, _req: Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message })
  })
  return app
}

describe('chat routes', () => {
  test('sends a message for room members', async () => {
    const state = {
      roomMembers: [
        { room_id: '11111111-1111-4111-8111-111111111111', user_id: 'user-1', is_owner: false },
      ],
      messages: [],
    }
    configureSupabaseMock(state)
    const app = createTestApp(createMockDb())
    const agent = request(app) as any

    const res = await agent
      .post('/api/v1/chat/rooms/11111111-1111-4111-8111-111111111111/messages')
      .send({ content: 'Hello there' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      room_id: '11111111-1111-4111-8111-111111111111',
      sender_id: 'user-1',
      content: 'Hello there',
    })
    expect(state.messages).toHaveLength(1)
  })

  test('rejects non-members from sending messages', async () => {
    configureSupabaseMock({ roomMembers: [], messages: [] })
    const app = createTestApp(createMockDb())
    const agent = request(app) as any

    const res = await agent
      .post('/api/v1/chat/rooms/11111111-1111-4111-8111-111111111111/messages')
      .send({ content: 'Hello there' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('You are not a member of this room.')
  })

  test('rejects empty messages without a photo', async () => {
    const state = {
      roomMembers: [
        { room_id: '11111111-1111-4111-8111-111111111111', user_id: 'user-1', is_owner: false },
      ],
      messages: [],
    }
    configureSupabaseMock(state)
    const app = createTestApp(createMockDb())
    const agent = request(app) as any

    const res = await agent
      .post('/api/v1/chat/rooms/11111111-1111-4111-8111-111111111111/messages')
      .send({ content: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Message content is empty')
  })
})
