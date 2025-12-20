import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockSetAuthToken = vi.fn()

const mockUpdateUser = vi.fn()
const mockGetSession = vi.fn()
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
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('AuthContext.updatePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Initial provider mount session
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'old-token',
          user: { id: 'user-1' },
        },
      },
    })

    // Session after password update
    mockGetSession.mockResolvedValueOnce({
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
})
