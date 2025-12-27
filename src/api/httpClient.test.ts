import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { request, __resetNetworkState, API_BASE_URL, __resetCsrfTokenForTests } from './httpClient'

// Mock fetch
let fetchMock: any
let consoleLogSpy: ReturnType<typeof vi.spyOn> | undefined

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

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy?.mockRestore()
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

  it('should replace empty X-CSRF-Token header by fetching a token', async () => {
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

    const result = await request<{ success: boolean }>({
      path: '/test',
      method: 'POST',
      body: { a: 1 },
      headers: { 'X-CSRF-Token': '' },
    })
    expect(result).toEqual({ success: true })

    // Should still fetch /csrf because the provided header value is blank.
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/csrf`)
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({

    expect(result).toEqual({ success: true })

    // First call fetches /csrf
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/csrf`)

    // Second call is the actual request with the overwritten CSRF header
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE_URL}/test`)
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'test-csrf-token' }),
      }),
    )
  })

  it('should not overwrite a non-empty X-CSRF-Token header provided by the caller', async () => {
    fetchMock.mockResolvedValueOnce({
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    })

    const result = await request<{ success: boolean }>({
      path: '/test',
      method: 'POST',
      body: { a: 1 },
      headers: { 'X-CSRF-Token': 'manual-token' },
    })
    expect(result).toEqual({ success: true })

    // No /csrf fetch should occur.

    expect(result).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/test`)
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'manual-token' }),
      }),
    )
  })

  it('should fail closed and not send unsafe request when CSRF token retrieval fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'nope',
    })

    await expect(
      request({
        path: '/test',
        method: 'POST',
        body: { a: 1 },
      }),
    ).rejects.toThrow('Abort: CSRF token could not be retrieved')

    // CSRF bootstrap was attempted, but the unsafe request itself was never sent.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/csrf`)
  })

  it('should not fetch CSRF token for GET requests', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    })

    const result = await request<{ success: boolean }>({
      path: '/test',
      method: 'GET',
    })

    expect(result).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test`, expect.anything())

    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).not.toHaveProperty('X-CSRF-Token')
  })

  it('should fail closed when /csrf response is missing csrfToken', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await expect(
      request({
        path: '/test',
        method: 'POST',
        body: { name: 'test' },
      }),
    ).rejects.toThrow('Abort: CSRF token could not be retrieved')

    // Should never send the unsafe request without a token.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/csrf`)
  })

  it('should single-flight CSRF token fetch for concurrent unsafe requests', async () => {
    let resolveCsrf!: (value: any) => void
    const csrfPromise: Promise<any> = new Promise<any>((resolve) => {
      resolveCsrf = resolve
    })

    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/csrf')) return csrfPromise
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      })
    })

    const p1 = request({ path: '/test', method: 'POST', body: { i: 1 } })
    const p2 = request({ path: '/test', method: 'POST', body: { i: 2 } })

    await Promise.resolve()

    const csrfCallsBeforeResolve = fetchMock.mock.calls.filter(([u]: any[]) => String(u).endsWith('/csrf')).length
    expect(csrfCallsBeforeResolve).toBe(1)

    resolveCsrf({
      ok: true,
      status: 200,
      json: async () => ({ csrfToken: 'test-csrf-token' }),
    })

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual({ success: true })
    expect(r2).toEqual({ success: true })

    const csrfCalls = fetchMock.mock.calls.filter(([u]: any[]) => String(u).endsWith('/csrf')).length
    const testCalls = fetchMock.mock.calls.filter(([u]: any[]) => String(u).endsWith('/test')).length
    expect(csrfCalls).toBe(1)
    expect(testCalls).toBe(2)
  })
})
