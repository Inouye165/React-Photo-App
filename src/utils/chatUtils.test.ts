import { describe, expect, it } from 'vitest'

import { asChatMessage } from './chatUtils'

describe('chatUtils.asChatMessage', () => {
  it('coerces photo_id numeric string to number', () => {
    const msg = asChatMessage({
      id: 1,
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'hi',
      photo_id: '42',
      created_at: new Date().toISOString(),
    })

    expect(msg).not.toBeNull()
    expect(msg?.photo_id).toBe(42)
  })

  it('coerces id numeric string to number', () => {
    const msg = asChatMessage({
      id: '123',
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'hi',
      photo_id: null,
      created_at: new Date().toISOString(),
    })

    expect(msg).not.toBeNull()
    expect(msg?.id).toBe(123)
  })

  it('treats non-numeric photo_id as null', () => {
    const msg = asChatMessage({
      id: 1,
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'hi',
      photo_id: 'not-a-number',
      created_at: new Date().toISOString(),
    })

    expect(msg).not.toBeNull()
    expect(msg?.photo_id).toBeNull()
  })
})
