import { describe, expect, it } from 'vitest'

import { asChatMessage, sortMessages } from './chatUtils'

describe('chatUtils.asChatMessage', () => {
  it('accepts UUID message id and UUID photo_id string', () => {
    const msg = asChatMessage({
      id: '11111111-1111-4111-8111-111111111111',
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'hi',
      photo_id: '22222222-2222-4222-8222-222222222222',
      created_at: new Date().toISOString(),
    })

    expect(msg).not.toBeNull()
    expect(msg?.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(msg?.photo_id).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('returns null when id is not a UUID string', () => {
    const msg = asChatMessage({
      id: 123,
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'hi',
      photo_id: null,
      created_at: new Date().toISOString(),
    })

    expect(msg).toBeNull()
  })

  it('treats non-string photo_id as null', () => {
    const msg = asChatMessage({
      id: '11111111-1111-4111-8111-111111111111',
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'hi',
      photo_id: 42,
      created_at: new Date().toISOString(),
    })

    expect(msg).not.toBeNull()
    expect(msg?.photo_id).toBeNull()
  })
})

describe('chatUtils.sortMessages', () => {
  it('sorts by created_at and breaks ties with id string compare', () => {
    const iso = '2026-03-01T17:00:00.000Z'
    const sorted = sortMessages([
      {
        id: 'b1111111-1111-4111-8111-111111111111',
        room_id: 'room-1',
        sender_id: 'user-1',
        content: 'second',
        photo_id: null,
        created_at: iso,
      },
      {
        id: 'a1111111-1111-4111-8111-111111111111',
        room_id: 'room-1',
        sender_id: 'user-1',
        content: 'first',
        photo_id: null,
        created_at: iso,
      },
    ])

    expect(sorted[0].id).toBe('a1111111-1111-4111-8111-111111111111')
    expect(sorted[1].id).toBe('b1111111-1111-4111-8111-111111111111')
  })
})
