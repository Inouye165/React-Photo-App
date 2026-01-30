import { describe, expect, it } from 'vitest'
import { buildPadUrl } from './whiteboardPadUrl'

describe('buildPadUrl', () => {
  it('builds an absolute pad URL when origin is not provided', () => {
    const result = buildPadUrl({ boardId: 'room-123' })
    expect(result).toBe(`${window.location.origin}/chat/room-123/pad`)
  })

  it('builds an absolute pad URL with origin', () => {
    const result = buildPadUrl({ boardId: 'room-123', origin: 'https://example.com' })
    expect(result).toBe('https://example.com/chat/room-123/pad')
  })
})
