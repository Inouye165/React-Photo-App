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
})
