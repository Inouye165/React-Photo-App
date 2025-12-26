import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { request, __resetNetworkState, API_BASE_URL, __resetCsrfTokenForTests } from './httpClient'

// Mock fetch
let fetchMock: any

describe('httpClient', () => {
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    __resetNetworkState()
    __resetCsrfTokenForTests()
    if ((global as any).__resetLimiters) {
        (global as any).__resetLimiters.forEach((fn: any) => fn())
    }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should make a successful GET request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    })

    const result = await request<{ success: boolean }>({ path: '/test' })
    expect(result).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test`, expect.objectContaining({
      method: 'GET',
    }))
  })

  it('should handle query parameters', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await request({ path: '/test', query: { foo: 'bar', baz: 123 } })
    expect(fetchMock).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/test?foo=bar&baz=123'),
      expect.anything()
    )
  })

  it('should throw ApiError on 4xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad Request' }),
    })

    await expect(request({ path: '/test' })).rejects.toThrow('Bad Request')
    await expect(request({ path: '/test' })).rejects.toMatchObject({
      status: 400,
      name: 'ApiError',
    })
  })

  it('should throw ApiError on 5xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      json: async () => { throw new Error() }, // non-JSON response
    })

    await expect(request({ path: '/test' })).rejects.toThrow('Internal Server Error')
  })

  it('should handle auth errors (401)', async () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
    })

    await expect(request({ path: '/test' })).rejects.toThrow('Authentication failed')
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent))
    expect(dispatchEventSpy.mock.calls[0][0].type).toBe('auth:session-expired')
  })

  it('should handle timeout', async () => {
    fetchMock.mockImplementation((_url: unknown, options: any) => {
      return new Promise((_resolve, reject) => {
        if (options.signal) {
          if (options.signal.aborted) {
             const err = new Error('The user aborted a request')
             err.name = 'AbortError'
             reject(err)
          } else {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The user aborted a request')
              err.name = 'AbortError'
              reject(err)
            })
          }
        }
      })
    })

    const promise = request({ path: '/test', timeoutMs: 100 })
    
    vi.advanceTimersByTime(101)
    
    await expect(promise).rejects.toThrow(/aborted/i)
  })

  it('should attach X-CSRF-Token for unsafe methods', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ csrfToken: 'test-csrf-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      })

    const result = await request<{ success: boolean }>({ path: '/test', method: 'POST', body: { a: 1 } })
    expect(result).toEqual({ success: true })

    // First call fetches /csrf
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/csrf`)
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'GET', credentials: 'include' }))

    // Second call is the actual request with the CSRF header
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE_URL}/test`)
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'test-csrf-token' }),
      })
    )
  })
})
