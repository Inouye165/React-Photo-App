import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { getPhotos } from './photos'

function makeAbortError(message = 'Aborted'): Error {
  const err = new Error(message)
  ;(err as any).name = 'AbortError'
  return err
}

describe('getPhotos timeout/abort', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    // Make sure we don't reuse a cached in-flight request from other tests.
    ;(globalThis as any).__getPhotosInflight = undefined

    // A fetch mock that never resolves unless aborted.
    vi.stubGlobal(
      'fetch',
      vi.fn((_: any, init?: RequestInit) => {
        const signal = init?.signal
        return new Promise((_, reject) => {
          if (signal?.aborted) {
            reject(makeAbortError())
            return
          }
          signal?.addEventListener(
            'abort',
            () => {
              reject(makeAbortError())
            },
            { once: true },
          )
        })
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aborts when timeoutMs elapses', async () => {
    const promise = getPhotos('https://example.com/photos?test=getPhotosTimeout', { timeoutMs: 12_000 })
    // Attach a handler immediately to avoid unhandled rejection warnings.
    // This does not change the promise value; it only marks the rejection as handled.
    void promise.catch(() => {})

    // getPhotos now awaits async auth header resolution before issuing the request.
    // Flush microtasks so the request path reaches fetch.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve()
    }

    expect((globalThis.fetch as any)).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(12_001)

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
