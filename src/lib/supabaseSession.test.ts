import { describe, expect, it, vi } from 'vitest'

describe('supabaseSession', () => {
  it('singleflights concurrent getSession calls', async () => {
    vi.resetModules()

    const { supabase } = await import('../supabaseClient')

    const getSessionMock = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ data: { session: { access_token: 't1' } }, error: null }), 25)
          }),
      )

    ;(supabase.auth.getSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(getSessionMock)

    const { getSessionSingleflight } = await import('./supabaseSession')

    const p1 = getSessionSingleflight()
    const p2 = getSessionSingleflight()

    const [s1, s2] = await Promise.all([p1, p2])

    expect(getSessionMock).toHaveBeenCalledTimes(1)
    expect(s1?.access_token).toBe('t1')
    expect(s2?.access_token).toBe('t1')
  })

  it('fails closed on invalid refresh token (signs out, returns null)', async () => {
    vi.resetModules()

    const { supabase } = await import('../supabaseClient')

    const signOutMock = vi.fn().mockResolvedValue({ error: null })
    ;(supabase.auth.signOut as unknown as ReturnType<typeof vi.fn>).mockImplementation(signOutMock)

    const getSessionMock = vi.fn().mockRejectedValue(new Error('AuthApiError: Invalid Refresh Token: Refresh Token Not Found'))
    ;(supabase.auth.getSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(getSessionMock)

    const { getSessionSingleflight } = await import('./supabaseSession')

    const session = await getSessionSingleflight()

    expect(getSessionMock).toHaveBeenCalledTimes(1)
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(session).toBeNull()
  })
})
