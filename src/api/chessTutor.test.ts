import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}))

vi.mock('./auth', () => ({
  getAuthHeadersAsync: vi.fn(async () => ({})),
}))

vi.mock('./httpClient', () => ({
  request: requestMock,
  ApiError: class ApiError extends Error {
    status?: number

    constructor(message: string, options?: { status?: number }) {
      super(message)
      this.name = 'ApiError'
      this.status = options?.status
    }
  },
  API_BASE_URL: 'https://api.example.test',
}))

import { __resetStoryAudioCacheForTests, ensureStoryAudio } from './chessTutor'

async function computeStoryAudioHash(input: { text: string; totalPages: number; voice: string }) {
  const payload = JSON.stringify({
    version: 'v2',
    text: input.text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim(),
    totalPages: Number(input.totalPages || 1),
    voice: String(input.voice || 'shimmer'),
  })

  const bytes = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((entry) => entry.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

describe('chessTutor.ensureStoryAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetStoryAudioCacheForTests()

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 } as Response)))
  })

  it('memoizes ensured audio URLs and skips repeat API calls for same narration payload', async () => {
    requestMock.mockResolvedValue({
      success: true,
      cached: false,
      url: 'https://cdn.example.test/story-audio/page-1.mp3',
    })

    const input = {
      storySlug: 'architect-of-squares' as const,
      page: 1,
      totalPages: 8,
      text: 'Once upon a chessboard.',
      voice: 'shimmer' as const,
    }

    const first = await ensureStoryAudio(input)
    expect(first.url).toBe('https://cdn.example.test/story-audio/page-1.mp3')
    expect(requestMock).toHaveBeenCalledTimes(1)

    requestMock.mockClear()

    const second = await ensureStoryAudio(input)
    expect(second.url).toBe('https://cdn.example.test/story-audio/page-1.mp3')
    expect(second.cached).toBe(true)
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('uses a matching precomputed manifest URL when available and reachable', async () => {
    const text = 'Silas found the dusty wooden box in the attic.'
    const hash = await computeStoryAudioHash({ text, totalPages: 8, voice: 'shimmer' })
    const precomputedUrl = 'https://cdn.example.test/story-audio/precomputed-page-1.mp3'

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/chess-story/architect-of-squares.audio-manifest.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            storySlug: 'architect-of-squares',
            voice: 'shimmer',
            cacheVersion: 'v2',
            totalPages: 8,
            entries: [{ page: 1, hash, url: precomputedUrl }],
          }),
        } as Response
      }

      if (url === precomputedUrl && init?.method === 'HEAD') {
        return { ok: true, status: 200 } as Response
      }

      return { ok: false, status: 404 } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await ensureStoryAudio({
      storySlug: 'architect-of-squares',
      page: 1,
      totalPages: 8,
      text,
      voice: 'shimmer',
    })

    expect(result.url).toBe(precomputedUrl)
    expect(result.cached).toBe(true)
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('falls back to ensure API when precomputed manifest URL is not reachable', async () => {
    const text = 'A different narration text for fallback test.'
    const hash = await computeStoryAudioHash({ text, totalPages: 8, voice: 'shimmer' })
    const unreachableUrl = 'https://cdn.example.test/story-audio/unreachable-page-1.mp3'

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/chess-story/architect-of-squares.audio-manifest.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            storySlug: 'architect-of-squares',
            voice: 'shimmer',
            cacheVersion: 'v2',
            totalPages: 8,
            entries: [{ page: 1, hash, url: unreachableUrl }],
          }),
        } as Response
      }

      if (url === unreachableUrl && init?.method === 'HEAD') {
        return { ok: false, status: 404 } as Response
      }

      return { ok: false, status: 404 } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    requestMock.mockResolvedValue({
      success: true,
      cached: false,
      url: 'https://api.example.test/generated/page-1.mp3',
    })

    const result = await ensureStoryAudio({
      storySlug: 'architect-of-squares',
      page: 1,
      totalPages: 8,
      text,
      voice: 'shimmer',
    })

    expect(result.url).toBe('https://api.example.test/generated/page-1.mp3')
    expect(requestMock).toHaveBeenCalledTimes(1)
  })
})
