import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Note: the hook imports these from "../api" (src/api.ts)
vi.mock('../api', () => ({
  fetchProtectedBlobUrl: vi.fn(),
  revokeBlobUrl: vi.fn(),
  isAbortError: vi.fn(),
}))

import { fetchProtectedBlobUrl, revokeBlobUrl, isAbortError } from '../api'
import { useProtectedImageBlobUrl } from './useProtectedImageBlobUrl'

function flushMicrotasks(times = 2) {
  return act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve()
    }
  })
}

describe('useProtectedImageBlobUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // happy-dom usually provides this, but make sure it exists for stability.
    if (!globalThis.window.AbortController && globalThis.AbortController) {
      globalThis.window.AbortController = globalThis.AbortController
    }

    isAbortError.mockImplementation(err => err?.name === 'AbortError')
  })

  it('success path: sets blob URL and clears loading/error', async () => {
    fetchProtectedBlobUrl.mockResolvedValue('blob:xyz')

    const { result } = renderHook(() => useProtectedImageBlobUrl('http://example/img'))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.fetchError).toBe(false)
    expect(result.current.imageBlobUrl).toBe(null)

    await flushMicrotasks()

    expect(result.current.imageBlobUrl).toBe('blob:xyz')
    expect(result.current.fetchError).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores AbortError-like failures (no fetchError)', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    fetchProtectedBlobUrl.mockRejectedValue(abortErr)

    const { result } = renderHook(() => useProtectedImageBlobUrl('http://example/img'))

    expect(result.current.isLoading).toBe(true)

    await flushMicrotasks()

    expect(result.current.fetchError).toBe(false)
    expect(result.current.imageBlobUrl).toBe(null)
  })

  it('revokes object URL on unmount if it resolves after unmount', async () => {
    let resolveFetch
    fetchProtectedBlobUrl.mockImplementation((_url, _opts) =>
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )

    const { unmount } = renderHook(() => useProtectedImageBlobUrl('http://example/img'))

    // Unmount before the request resolves
    unmount()

    // Late resolve should be revoked and should not set state
    resolveFetch('blob:late')
    await flushMicrotasks()

    expect(revokeBlobUrl).toHaveBeenCalledWith('blob:late')
  })

  it('revokes previous blob URL when displayUrl changes', async () => {
    fetchProtectedBlobUrl
      .mockResolvedValueOnce('blob:one')
      .mockResolvedValueOnce('blob:two')

    const { result, rerender, unmount } = renderHook(
      ({ url }) => useProtectedImageBlobUrl(url),
      { initialProps: { url: 'http://example/one' } }
    )

    await flushMicrotasks()
    expect(result.current.imageBlobUrl).toBe('blob:one')

    rerender({ url: 'http://example/two' })

    // Cleanup should revoke the previous object URL
    expect(revokeBlobUrl).toHaveBeenCalledWith('blob:one')

    await flushMicrotasks()
    expect(result.current.imageBlobUrl).toBe('blob:two')

    unmount()
    expect(revokeBlobUrl).toHaveBeenCalledWith('blob:two')
  })

  it('aborts previous fetch on url change', async () => {
    let firstSignal

    fetchProtectedBlobUrl.mockImplementationOnce((_url, opts) => {
      firstSignal = opts?.signal
      // Keep pending so the rerender triggers abort
      return new Promise(() => {})
    })

    fetchProtectedBlobUrl.mockResolvedValueOnce('blob:two')

    const { rerender } = renderHook(
      ({ url }) => useProtectedImageBlobUrl(url),
      { initialProps: { url: 'http://example/one' } }
    )

    expect(firstSignal).toBeDefined()
    expect(firstSignal.aborted).toBe(false)

    rerender({ url: 'http://example/two' })

    expect(firstSignal.aborted).toBe(true)
  })

  it('retry refetches after non-abort failure', async () => {
    fetchProtectedBlobUrl
      .mockRejectedValueOnce(new Error('network fail'))
      .mockResolvedValueOnce('blob:ok')

    const { result } = renderHook(() => useProtectedImageBlobUrl('http://example/img'))

    await flushMicrotasks()

    expect(result.current.fetchError).toBe(true)
    expect(result.current.imageBlobUrl).toBe(null)

    await act(async () => {
      result.current.retry()
    })

    await flushMicrotasks()

    expect(result.current.fetchError).toBe(false)
    expect(result.current.imageBlobUrl).toBe('blob:ok')
  })

  it('treats a null blob URL as an error', async () => {
    fetchProtectedBlobUrl.mockResolvedValueOnce(null)

    const { result } = renderHook(() => useProtectedImageBlobUrl('http://example/img'))

    await flushMicrotasks()

    expect(result.current.fetchError).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.imageBlobUrl).toBe(null)
  })
})
