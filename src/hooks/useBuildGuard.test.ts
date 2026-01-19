import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const logoutSpy = vi.fn().mockResolvedValue(undefined)

async function importBuildGuardWithAuth(session: unknown) {
  vi.resetModules()
  vi.doMock('../config/apiConfig', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../config/apiConfig')>()
    return {
      ...actual,
      buildApiUrl: (path: string) => path,
    }
  })
  vi.doMock('../contexts/AuthContext', () => ({
    useAuth: () => ({
      logout: logoutSpy,
      session,
    }),
  }))

  return await import('./useBuildGuard')
}

describe('build guard', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.restoreAllMocks()
    logoutSpy.mockClear()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('first run stores bootId and does not logout', async () => {
    const { checkBuildIdOnce, SERVER_BOOT_ID_STORAGE_KEY } = await importBuildGuardWithAuth(null)

    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'any-build', bootId: 'boot-1' }),
    })

    const handleMismatch = vi.fn().mockResolvedValue('reloaded')

    const result = await checkBuildIdOnce({
      buildMetaUrl: '/api/meta',
      handleMismatch,
      fetcher,
      storage: window.sessionStorage,
    })

    expect(result).toBe('ok')
    expect(handleMismatch).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(SERVER_BOOT_ID_STORAGE_KEY)).toBe('boot-1')
  })

  it('second run with same bootId does not logout', async () => {
    const { checkBuildIdOnce, SERVER_BOOT_ID_STORAGE_KEY } = await importBuildGuardWithAuth(null)
    window.sessionStorage.setItem(SERVER_BOOT_ID_STORAGE_KEY, 'boot-1')

    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'any-build', bootId: 'boot-1' }),
    })

    const handleMismatch = vi.fn().mockResolvedValue('reloaded')

    const result = await checkBuildIdOnce({
      buildMetaUrl: '/api/meta',
      handleMismatch,
      fetcher,
      storage: window.sessionStorage,
    })

    expect(result).toBe('ok')
    expect(handleMismatch).not.toHaveBeenCalled()
  })

  it('bootId change triggers logout exactly once', async () => {
    const { handleBuildMismatch, SERVER_BOOT_ID_STORAGE_KEY } = await importBuildGuardWithAuth(null)

    const logout = vi.fn().mockResolvedValue(undefined)
    const clearAuthState = vi.fn()
    const reload = vi.fn()

    const result = await handleBuildMismatch({
      logout,
      clearAuthState,
      storage: window.sessionStorage,
      now: () => 1_000,
      reload,
      serverBootId: 'boot-2',
    })

    expect(result).toBe('reloaded')
    expect(logout).toHaveBeenCalledTimes(1)
    expect(clearAuthState).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem(SERVER_BOOT_ID_STORAGE_KEY)).toBe('boot-2')
  })

  it('throttles repeated reloads within window', async () => {
    const { handleBuildMismatch, BUILD_GUARD_STORAGE_KEY } = await importBuildGuardWithAuth(null)
    window.sessionStorage.setItem(BUILD_GUARD_STORAGE_KEY, '1000')

    const logout = vi.fn().mockResolvedValue(undefined)
    const clearAuthState = vi.fn()
    const reload = vi.fn()

    const result = await handleBuildMismatch({
      logout,
      clearAuthState,
      storage: window.sessionStorage,
      now: () => 20_000,
      reload,
      serverBootId: 'boot-2',
    })

    expect(result).toBe('throttled')
    expect(logout).not.toHaveBeenCalled()
    expect(clearAuthState).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('ignores network errors when checking server build id', async () => {
    const { checkBuildIdOnce } = await importBuildGuardWithAuth(null)

    const fetcher = vi.fn().mockRejectedValue(new Error('network'))
    const handleMismatch = vi.fn().mockResolvedValue('reloaded')

    const result = await checkBuildIdOnce({
      buildMetaUrl: '/api/meta',
      handleMismatch,
      fetcher,
      storage: window.sessionStorage,
    })

    expect(result).toBe('error')
    expect(handleMismatch).not.toHaveBeenCalled()
  })

  it('hook: unauthenticated user does not store bootId or logout', async () => {
    const { default: useBuildGuard, SERVER_BOOT_ID_STORAGE_KEY } = await importBuildGuardWithAuth(null)

    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'any-build', bootId: 'boot-1' }),
    })
    vi.stubGlobal('fetch', fetcher)

    renderHook(() => useBuildGuard())

    // Let the initial effect run.
    await Promise.resolve()

    expect(window.sessionStorage.getItem(SERVER_BOOT_ID_STORAGE_KEY)).toBe(null)
    expect(logoutSpy).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('hook: bootId change logs out once', async () => {
    const { default: useBuildGuard, SERVER_BOOT_ID_STORAGE_KEY } = await importBuildGuardWithAuth({ access_token: 'token' })

    window.sessionStorage.setItem(SERVER_BOOT_ID_STORAGE_KEY, 'boot-1')

    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'any-build', bootId: 'boot-2' }),
    })
    vi.stubGlobal('fetch', fetcher)

    renderHook(() => useBuildGuard())

    await waitFor(() => expect(logoutSpy).toHaveBeenCalledTimes(1))
    expect(window.sessionStorage.getItem(SERVER_BOOT_ID_STORAGE_KEY)).toBe('boot-2')
  })
})
