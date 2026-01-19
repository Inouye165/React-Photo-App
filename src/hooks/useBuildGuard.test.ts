import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  BUILD_GUARD_STORAGE_KEY,
  checkBuildIdOnce,
  handleBuildMismatch,
} from './useBuildGuard'

describe('build guard', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('does nothing when build ids match', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'same-build' }),
    })

    const handleMismatch = vi.fn()

    const result = await checkBuildIdOnce({
      clientBuildId: 'same-build',
      buildMetaUrl: '/api/meta',
      handleMismatch,
      fetcher,
    })

    expect(result).toBe('ok')
    expect(handleMismatch).not.toHaveBeenCalled()
  })

  it('triggers logout and reload on mismatch', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    const clearAuthState = vi.fn()
    const reload = vi.fn()
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })

    const result = await handleBuildMismatch({
      logout,
      clearAuthState,
      logoutEndpoint: '/api/auth/logout',
      fetcher,
      storage: window.sessionStorage,
      now: () => 1_000,
      reload,
    })

    expect(result).toBe('reloaded')
    expect(logout).toHaveBeenCalledTimes(1)
    expect(clearAuthState).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('throttles repeated reloads within window', async () => {
    window.sessionStorage.setItem(BUILD_GUARD_STORAGE_KEY, '1000')

    const logout = vi.fn().mockResolvedValue(undefined)
    const clearAuthState = vi.fn()
    const reload = vi.fn()

    const result = await handleBuildMismatch({
      logout,
      clearAuthState,
      logoutEndpoint: '/api/auth/logout',
      storage: window.sessionStorage,
      now: () => 20_000,
      reload,
    })

    expect(result).toBe('throttled')
    expect(logout).not.toHaveBeenCalled()
    expect(clearAuthState).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('ignores network errors when checking server build id', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network'))
    const handleMismatch = vi.fn()

    const result = await checkBuildIdOnce({
      clientBuildId: 'local',
      buildMetaUrl: '/api/meta',
      handleMismatch,
      fetcher,
    })

    expect(result).toBe('error')
    expect(handleMismatch).not.toHaveBeenCalled()
  })
})
