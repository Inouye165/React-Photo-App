import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Import store after mock setup (matches repo testing pattern)
vi.mock('../store', async () => {
  const actual = await vi.importActual('../store')
  return actual
})

vi.mock('../api', async (importOriginal: () => Promise<unknown>) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    API_BASE_URL: 'http://api',
    getAccessToken: vi.fn(() => 'test-token'),
  }
})

vi.mock('../realtime/sseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../realtime/sseClient')>()
  return {
    ...actual,
    connectPhotoEvents: vi.fn(),
  }
})

describe('usePhotoProcessingEvents', () => {
  let useStore: typeof import('../store').default
  let connectPhotoEvents: typeof import('../realtime/sseClient').connectPhotoEvents
  let computeReconnectDelayMs: typeof import('./usePhotoProcessingEvents').computeReconnectDelayMs
  let createEventDedupe: typeof import('./usePhotoProcessingEvents').createEventDedupe
  let usePhotoProcessingEvents: typeof import('./usePhotoProcessingEvents').usePhotoProcessingEvents

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_ENABLE_PHOTO_EVENTS', 'true')
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // deterministic (mult=1)

    // Ensure mocks apply consistently and store/module singletons are reset.
    vi.clearAllMocks()
    vi.resetModules()

    // Import after resetModules so everything shares the same module instance.
    ;({ default: useStore } = await import('../store'))
    ;({ connectPhotoEvents } = await import('../realtime/sseClient'))
    ;({ computeReconnectDelayMs, createEventDedupe, usePhotoProcessingEvents } = await import('./usePhotoProcessingEvents'))

    // Reset store to a safe baseline
    useStore.setState({
      photoEventsStreamingActive: false,
      pollingPhotoId: null,
      pollingPhotoIds: new Set([1]),
      photos: [{ id: 1, url: '/photos/1.jpg', state: 'inprogress' }],
    } as any)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const makeClient = () => {
    let resolveClosed: (() => void) | null = null
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve
    })

    return {
      close: vi.fn(() => {
        try {
          resolveClosed?.()
        } catch {
          // ignore
        }
      }),
      closed,
    }
  }

  it('computeReconnectDelayMs is deterministic with injected random', () => {
    expect(computeReconnectDelayMs(0, { random: () => 0.5, baseMs: 500, jitterRatio: 0.2 })).toBe(500)
    expect(computeReconnectDelayMs(1, { random: () => 0.5, baseMs: 500, jitterRatio: 0.2 })).toBe(1000)
    expect(computeReconnectDelayMs(2, { random: () => 0.5, baseMs: 500, jitterRatio: 0.2 })).toBe(2000)
  })

  it('createEventDedupe ignores duplicates and bounds memory', () => {
    const d = createEventDedupe(2)
    d.add('a')
    d.add('a')
    d.add('b')
    d.add('c')

    expect(d.has('a')).toBe(false) // evicted
    expect(d.has('b')).toBe(true)
    expect(d.has('c')).toBe(true)
    expect(d.size()).toBe(2)
  })

  it('falls back to polling after 3 consecutive stream failures', async () => {
    const startSpy = vi.spyOn(useStore.getState(), 'startAiPolling')

    vi.mocked(connectPhotoEvents).mockRejectedValue(new Error('connect failed'))

    renderHook(() => usePhotoProcessingEvents({ authed: true }))

    // Initial attempt fails -> schedules reconnect at 1000ms
    await Promise.resolve()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(2000)
    await Promise.resolve()

    // After the 3rd failure, fallback should resume polling for pending IDs
    expect(startSpy).toHaveBeenCalled()
  })

  it('does not start polling when stream is healthy', async () => {
    const startSpy = vi.spyOn(useStore.getState(), 'startAiPolling')

    vi.mocked(connectPhotoEvents).mockResolvedValue(makeClient() as any)

    renderHook(() => usePhotoProcessingEvents({ authed: true }))

    // Allow the async connect to resolve.
    await Promise.resolve()
    await Promise.resolve()

    expect(useStore.getState().photoEventsStreamingActive).toBe(true)
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('falls back to polling immediately on server kill switch (HTTP 503)', async () => {
    const startSpy = vi.spyOn(useStore.getState(), 'startAiPolling')
    const err = new Error('SSE connect failed (HTTP 503)') as Error & { status?: number }
    err.status = 503

    vi.mocked(connectPhotoEvents).mockRejectedValue(err)

    renderHook(() => usePhotoProcessingEvents({ authed: true }))

    await Promise.resolve()
    await Promise.resolve()

    // Should resume polling for pending IDs without waiting for 3 failures.
    expect(startSpy).toHaveBeenCalledWith(1)
  })

  it('dedupes repeated photo.processing events (no double-apply)', async () => {
    const updateSpy = vi.spyOn(useStore.getState(), 'updatePhoto')
    const stopSpy = vi.spyOn(useStore.getState(), 'stopAiPolling')

    let capturedOnEvent: ((frame: any) => void) | null = null
    vi.mocked(connectPhotoEvents).mockImplementation(async (params: any) => {
      capturedOnEvent = params?.onEvent
      return makeClient() as any
    })

    renderHook(() => usePhotoProcessingEvents({ authed: true }))
    await Promise.resolve()
    await Promise.resolve()

    expect(typeof capturedOnEvent).toBe('function')
    if (!capturedOnEvent) throw new Error('expected SSE onEvent callback to be captured')
    const onEvent: (frame: any) => void = capturedOnEvent as unknown as (frame: any) => void

    const payload = {
      eventId: 'evt-1',
      photoId: '1',
      status: 'finished',
      updatedAt: new Date().toISOString(),
    }

    onEvent({
      event: 'photo.processing',
      id: 'evt-1',
      data: JSON.stringify(payload),
    })
    onEvent({
      event: 'photo.processing',
      id: 'evt-1',
      data: JSON.stringify(payload),
    })

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(stopSpy).toHaveBeenCalledTimes(1)
  })

  it('reconnect prefers last seen SSE frame id over timestamp', async () => {
    let capturedOnEvent: ((frame: any) => void) | null = null

    const client1 = makeClient()
    const client2 = makeClient()

    vi.mocked(connectPhotoEvents)
      .mockImplementationOnce(async (params: any) => {
        capturedOnEvent = params?.onEvent
        return client1 as any
      })
      .mockResolvedValueOnce(client2 as any)

    renderHook(() => usePhotoProcessingEvents({ authed: true }))

    await Promise.resolve()
    await Promise.resolve()

    expect(vi.mocked(connectPhotoEvents).mock.calls[0][0]).toEqual(
      expect.objectContaining({ since: undefined }),
    )

    expect(typeof capturedOnEvent).toBe('function')
    if (typeof capturedOnEvent !== 'function') throw new Error('expected SSE onEvent callback to be captured')

    const onEvent: (frame: any) => void = capturedOnEvent
    onEvent({
      event: 'photo.processing',
      id: 'evt_123',
      data: JSON.stringify({
        eventId: 'evt_payload',
        photoId: '1',
        status: 'processing',
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
    })

    client1.close()

    await Promise.resolve()
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    await Promise.resolve()

    expect(vi.mocked(connectPhotoEvents).mock.calls[1][0]).toEqual(
      expect.objectContaining({ since: 'evt_123' }),
    )
  })
})
