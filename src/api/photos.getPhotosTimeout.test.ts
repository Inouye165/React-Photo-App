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
    const expectation = expect(
      getPhotos('https://example.com/photos?test=getPhotosTimeout', { timeoutMs: 12_000 }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect((globalThis.fetch as any)).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(12_001)

    await expectation
  })
})
