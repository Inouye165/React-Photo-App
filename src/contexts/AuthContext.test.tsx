import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

function makeMockResponse(payload: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true
  const status = init?.status ?? (ok ? 200 : 500)
  return {
    ok,
    status,
    headers: new Headers(),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    blob: async () => new Blob([JSON.stringify(payload)]),
  }
}

const originalFetch = global.fetch

beforeEach(() => {
  // This suite expects real AuthContext to run (via doUnmock) and will trigger
  // both preferences + profile fetching; provide a stable Response-like fetch.
  global.fetch = vi.fn(async (url: any, options: any = {}) => {
    const href = typeof url === 'string' ? url : String(url?.url || url)
    const method = (options?.method || 'GET').toUpperCase()

    if (href.includes('/api/users/me/preferences')) {
      return makeMockResponse({
        success: true,
        data: {
          gradingScales: {},
        },
      }) as any
    }

    if (href.includes('/api/users/me') && method === 'GET') {
      return makeMockResponse({
        success: true,
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          username: 'testuser',
          has_set_username: true,
        },
      }) as any
    }

    return makeMockResponse({ success: false, error: 'Not found' }, { ok: false, status: 404 }) as any
  }) as any
})

afterEach(() => {
  global.fetch = originalFetch
})

const mockSetAuthToken = vi.fn()

const mockUpdateUser = vi.fn()
const mockGetSession = vi.fn()
const mockSignOut = vi.fn().mockResolvedValue({ error: null })
const mockRealtimeSetAuth = vi.fn().mockResolvedValue(undefined)
const mockOnAuthStateChange = vi.fn((_callback?: unknown) => ({
  data: {
    subscription: {
      unsubscribe: vi.fn(),
    },
  },
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    setAuthToken: (token: string | null) => mockSetAuthToken(token),
  }
})

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser: (payload: unknown) => mockUpdateUser(payload),
      onAuthStateChange: (callback: unknown) => mockOnAuthStateChange(callback),
      signOut: () => mockSignOut(),
    },
    realtime: {
      setAuth: (...args: unknown[]) => mockRealtimeSetAuth(...args),
    },
  },
}))

describe('AuthContext.updatePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
    mockRealtimeSetAuth.mockResolvedValue(undefined)

    // Initial provider mount session
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'old-token',
          user: { id: 'user-1' },
        },
      },
    })

    // Session after password update (and any subsequent refreshes)
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'new-token',
          user: { id: 'user-1' },
        },
      },
    })

    // updateUser does not always return session; exercise fallback refresh path
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1' }, session: null }, error: null })
  })

  it('calls supabase.auth.updateUser and setAuthToken with the refreshed session token', async () => {
    // The global test setup mocks AuthContext; unmock it for this file.
    vi.doUnmock('../contexts/AuthContext')
    const { AuthProvider, useAuth } = await import('../contexts/AuthContext')

    function Harness() {
      const { updatePassword } = useAuth()
      return (
        <button type="button" onClick={() => updatePassword('newpass1')}>
          Update
        </button>
      )
    }

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    // Wait for provider to finish initial auth initialization
    await screen.findByRole('button', { name: 'Update' })

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass1' })
    })

    await waitFor(() => {
      expect(mockSetAuthToken).toHaveBeenLastCalledWith('new-token')
      expect(mockRealtimeSetAuth).toHaveBeenLastCalledWith('new-token')
    })
  })

  it('returns a user-visible error message when Supabase throws (e.g., 400/500)', async () => {
    vi.doUnmock('../contexts/AuthContext')
    const { AuthProvider, useAuth } = await import('../contexts/AuthContext')

    mockUpdateUser.mockRejectedValueOnce({ message: 'Bad Request' })

    function Harness() {
      const { updatePassword } = useAuth()
      const [err, setErr] = React.useState<string>('')

      return (
        <div>
          <button
            type="button"
            onClick={async () => {
              const res = await updatePassword('newpass1')
              if (!res.success) setErr(res.error)
            }}
          >
            Update
          </button>
          {err ? <div>{err}</div> : null}
        </div>
      )
    }

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    await screen.findByRole('button', { name: 'Update' })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass1' })
    })

    expect(await screen.findByText('Bad Request')).toBeInTheDocument()
  })

  it('does not sign out on non-auth validation errors (e.g., same password)', async () => {
    vi.doUnmock('../contexts/AuthContext')
    const { AuthProvider, useAuth } = await import('../contexts/AuthContext')

    mockUpdateUser.mockRejectedValueOnce({
      message: 'New password should be different from the old password.',
      status: 422,
    })

    function Harness() {
      const { updatePassword } = useAuth()
      const [result, setResult] = React.useState<string>('')

      return (
        <div>
          <button
            type="button"
            onClick={async () => {
              const res = await updatePassword('newpass1')
              setResult(res.success ? 'ok' : res.error)
            }}
          >
            Update
          </button>
          {result ? <div>{result}</div> : null}
        </div>
      )
    }

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    await screen.findByRole('button', { name: 'Update' })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    expect(await screen.findByText('New password should be different from the old password.')).toBeInTheDocument()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('signs out and clears token on auth/session errors', async () => {
    vi.doUnmock('../contexts/AuthContext')
    const { AuthProvider, useAuth } = await import('../contexts/AuthContext')

    mockUpdateUser.mockRejectedValueOnce({
      message: 'Auth session missing!',
      status: 401,
      code: 'AUTH_ERROR',
    })

    function Harness() {
      const { updatePassword } = useAuth()

      return (
        <button type="button" onClick={() => updatePassword('newpass1')}>
          Update
        </button>
      )
    }

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    await screen.findByRole('button', { name: 'Update' })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1)
      expect(mockSetAuthToken).toHaveBeenCalledWith(null)
      expect(mockRealtimeSetAuth).toHaveBeenCalled()
    })
  })
})

describe('AuthContext profile fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Initial provider mount session
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'old-token',
          user: { id: 'user-1' },
        },
      },
    })
  })

  it('fetches /api/users/me and exposes profile in context', async () => {
    vi.doUnmock('../contexts/AuthContext')
    const { AuthProvider, useAuth } = await import('../contexts/AuthContext')

    function Harness() {
      const { profile, profileLoading } = useAuth() as any
      if (profileLoading) return <div>Loading profile</div>
      return <div>{profile ? profile.username : 'no-profile'}</div>
    }

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    // The shared test fetch mock returns username: testuser
    expect(await screen.findByText('testuser')).toBeInTheDocument()

    // Verify profile endpoint was called at least once
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/me'),
        expect.objectContaining({ method: 'GET' }),
      )
    })
  })
})
