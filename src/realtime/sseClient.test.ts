import { describe, it, expect } from 'vitest'

import { createSseParser } from './sseClient'

describe('realtime/sseClient - SSE parsing', () => {
  it('parses a complete SSE frame and dispatches on blank line', () => {
    const frames: Array<{ event: string | null; id: string | null; data: string }> = []
    const parser = createSseParser((f) => frames.push(f))

    parser.feedText('event: photo.processing\n')
    parser.feedText('id: evt-1\n')
    parser.feedText('data: {"photoId":"1","status":"finished"}\n')
    parser.feedText('\n')

    expect(frames).toHaveLength(1)
    expect(frames[0]).toEqual({
      event: 'photo.processing',
      id: 'evt-1',
      data: '{"photoId":"1","status":"finished"}',
    })
  })

  it('handles partial chunks across reads (splitting within lines)', () => {
    const frames: Array<{ event: string | null; id: string | null; data: string }> = []
    const parser = createSseParser((f) => frames.push(f))

    parser.feedText('event: photo.pro')
    parser.feedText('cessing\n')
    parser.feedText('id: evt-')
    parser.feedText('xyz\n')
    parser.feedText('data: {"photoId":"2","status":"processing"}')
    parser.feedText('\n')
    parser.feedText('\n')

    expect(frames).toHaveLength(1)
    expect(frames[0].event).toBe('photo.processing')
    expect(frames[0].id).toBe('evt-xyz')
    expect(frames[0].data).toBe('{"photoId":"2","status":"processing"}')
  })

  it('joins multiple data lines with \n per SSE spec', () => {
    const frames: Array<{ event: string | null; id: string | null; data: string }> = []
    const parser = createSseParser((f) => frames.push(f))

    parser.feedText('event: photo.processing\n')
    parser.feedText('id: evt-2\n')
    parser.feedText('data: line1\n')
    parser.feedText('data: line2\n')
    parser.feedText('\n')

    expect(frames).toHaveLength(1)
    expect(frames[0].data).toBe('line1\nline2')
  })

  it('ignores heartbeat/comment lines', () => {
    const frames: Array<{ event: string | null; id: string | null; data: string }> = []
    const parser = createSseParser((f) => frames.push(f))

    parser.feedText(': ping\n\n')
    parser.feedText(': another\n')
    parser.feedText(': comment\n\n')

    expect(frames).toHaveLength(0)
  })
})
