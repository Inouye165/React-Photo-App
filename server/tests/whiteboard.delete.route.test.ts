/* eslint-env jest */

import { describe, expect, jest, test } from '@jest/globals'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'

const createWhiteboardRouter = require('../routes/whiteboard')

type RoomMember = { room_id: string; user_id: string; is_owner?: boolean }

type MockDbState = {
  roomMembers: RoomMember[]
  rooms: Array<{ id: string; created_by?: string | null }>
  deleted: {
    whiteboardDocuments: string[]
    whiteboardEvents: string[]
    whiteboardInvites: string[]
    roomMembers: string[]
    rooms: string[]
  }
}

function createDeleteQuery(tableName: keyof MockDbState['deleted'], state: MockDbState) {
  const query: any = {
    _where: {},
    where(conditions: Record<string, string>) {
      Object.assign(query._where, conditions)
      return query
    },
    del: jest.fn().mockImplementation(() => {
      const targetId = query._where.board_id ?? query._where.room_id ?? query._where.id
      if (typeof targetId === 'string') {
        state.deleted[tableName].push(targetId)
      }
      if (tableName === 'rooms') {
        const before = state.rooms.length
        state.rooms = state.rooms.filter((room) => room.id !== query._where.id)
        return Promise.resolve(before - state.rooms.length)
      }
      return Promise.resolve(1)
    }),
  }

  if (tableName === 'rooms') {
    query.select = jest.fn().mockReturnValue(query)
    query.first = jest.fn().mockImplementation(() => {
      const row = state.rooms.find((room) => room.id === query._where.id) ?? null
      return Promise.resolve(row)
    })
  }

  if (tableName === 'roomMembers') {
    query.first = jest.fn().mockImplementation(() => {
      const row = state.roomMembers.find(
        (member) =>
          member.room_id === query._where.room_id &&
          member.user_id === query._where.user_id &&
          (query._where.is_owner === undefined || member.is_owner === query._where.is_owner),
      ) ?? null
      return Promise.resolve(row)
    })
  }

  return query
}

function createMockDb(state: MockDbState) {
  const makeTableQuery = (tableName: string) => {
    if (tableName === 'room_members') return createDeleteQuery('roomMembers', state)
    if (tableName === 'rooms') return createDeleteQuery('rooms', state)
    if (tableName === 'whiteboard_events') return createDeleteQuery('whiteboardEvents', state)
    if (tableName === 'whiteboard_invites') return createDeleteQuery('whiteboardInvites', state)
    if (tableName === 'whiteboard_documents') return createDeleteQuery('whiteboardDocuments', state)
    throw new Error(`Unexpected table: ${tableName}`)
  }

  const db: any = jest.fn((tableName: string) => makeTableQuery(tableName))
  db.transaction = jest.fn(async (callback: (trx: any) => Promise<void>) => {
    const trx: any = (tableName: string) => makeTableQuery(tableName)
    trx.schema = {
      hasTable: async () => true,
    }
    await callback(trx)
  })
  return db
}

function createTestApp(db: ReturnType<typeof createMockDb>) {
  const app = express()
  app.use(express.json())

  const authMiddleware = (req: Request & { user?: { id?: string } }, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1' }
    return next()
  }

  app.use('/api/whiteboards', authMiddleware, createWhiteboardRouter({ db }))
  return app
}

describe('whiteboard delete route', () => {
  const boardId = '11111111-1111-4111-8111-111111111111'

  test('deletes owner whiteboard data and room row', async () => {
    const state: MockDbState = {
      roomMembers: [{ room_id: boardId, user_id: 'user-1', is_owner: true }],
      rooms: [{ id: boardId, created_by: 'user-1' }],
      deleted: {
        whiteboardDocuments: [],
        whiteboardEvents: [],
        whiteboardInvites: [],
        roomMembers: [],
        rooms: [],
      },
    }
    const db = createMockDb(state)
    const app = createTestApp(db)

    const client = request(app) as any
    const res = await client.delete(`/api/whiteboards/${boardId}`)

    expect(res.status).toBe(204)
    expect(state.deleted.whiteboardDocuments).toContain(boardId)
    expect(state.deleted.whiteboardEvents).toContain(boardId)
    expect(state.deleted.whiteboardInvites).toContain(boardId)
    expect(state.deleted.roomMembers).toContain(boardId)
    expect(state.deleted.rooms).toContain(boardId)
  })
})
