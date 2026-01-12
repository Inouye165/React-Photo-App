import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { connectPhotoEvents, createSseParser } from './sseClient'

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

describe('realtime/sseClient - connectPhotoEvents', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sends Last-Event-ID header when since is provided', async () => {
    const read = vi.fn().mockResolvedValue({ value: undefined, done: true })
    const releaseLock = vi.fn()
    const getReader = vi.fn(() => ({ read, releaseLock }))

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: { getReader },
    })

    globalThis.fetch = fetchSpy as any

    const client = await connectPhotoEvents({
      apiBaseUrl: 'http://api',
      token: 't',
      since: 'evt_123',
      onEvent: () => {},
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>

    expect(headers.Authorization).toBe('Bearer t')
    expect(headers.Accept).toBe('text/event-stream')
    expect(headers['Last-Event-ID']).toBe('evt_123')

    await client.closed
  })
})
