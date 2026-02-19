import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import LoginForm from '../components/LoginForm'
import OnboardingPage from '../pages/OnboardingPage'
import IdentityGate from '../components/IdentityGate'

type SeedUser = {
  id: string
  email: string
  password: string
  username: string | null
}

type RuntimeAuthState = {
  user: { id: string; email: string } | null
  session: { access_token: string; user: { id: string; email: string } } | null
  profile: { id: string; username: string | null; has_set_username: boolean } | null
}

const seededUsers = new Map<string, SeedUser>()

const runtimeState: RuntimeAuthState = {
  user: null,
  session: null,
  profile: null,
}

function seedUserWithDefaultPassword(input: { email: string; password: string }): SeedUser {
  const normalizedEmail = input.email.trim().toLowerCase()
  const seeded: SeedUser = {
    id: 'seed-user-1',
    email: normalizedEmail,
    password: input.password,
    username: null,
  }
  seededUsers.set(normalizedEmail, seeded)
  return seeded
}

async function performLogin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const found = seededUsers.get(normalizedEmail)

  if (!found || found.password !== password) {
    return { success: false as const, error: 'Invalid login credentials' }
  }

  const nextUser = { id: found.id, email: found.email }
  runtimeState.user = nextUser
  runtimeState.session = { access_token: 'session-token', user: nextUser }
  runtimeState.profile = {
    id: found.id,
    username: found.username,
    has_set_username: Boolean(found.username),
  }

  return { success: true as const, user: nextUser }
}

async function performLogout() {
  runtimeState.user = null
  runtimeState.session = null
  runtimeState.profile = null
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: runtimeState.user,
    session: runtimeState.session,
    profile: runtimeState.profile,
    loading: false,
    authReady: true,
    cookieReady: true,
    profileLoading: false,
    profileError: null,
    preferences: { gradingScales: {} },
    updatePreferences: vi.fn(async () => ({ success: true, data: { gradingScales: {} } })),
    loadDefaultScales: vi.fn(async () => ({ success: true, data: { gradingScales: {} } })),
    signInWithPhone: vi.fn(async () => ({ success: false, error: 'not used in test' })),
    verifyPhoneOtp: vi.fn(async () => ({ success: false, error: 'not used in test' })),
    resetPassword: vi.fn(async () => ({ success: true, data: {} })),
    register: vi.fn(async () => ({ success: false, error: 'not used in test' })),
    login: vi.fn(async (email: string, password: string) => performLogin(email, password)),
    logout: vi.fn(async () => performLogout()),
    updatePassword: vi.fn(async (nextPassword: string) => {
      if (!runtimeState.user) return { success: false as const, error: 'Authentication required' }

      const existing = seededUsers.get(runtimeState.user.email)
      if (!existing) return { success: false as const, error: 'User not found' }

      existing.password = nextPassword
      return { success: true as const }
    }),
    updateAvatar: vi.fn(async () => ({ success: false, error: 'not used in test' })),
    updateProfile: vi.fn(async (username: string) => {
      if (!runtimeState.user) return { success: false as const, error: 'Authentication required' }

      const existing = seededUsers.get(runtimeState.user.email)
      if (!existing) return { success: false as const, error: 'User not found' }

      existing.username = username.trim()
      runtimeState.profile = {
        id: existing.id,
        username: existing.username,
        has_set_username: true,
      }

      return {
        success: true as const,
        profile: {
          id: existing.id,
          username: existing.username,
          has_set_username: true,
        },
      }
    }),
  }),
}))

vi.mock('../hooks/usePhotoProcessingEvents', () => ({
  usePhotoProcessingEvents: vi.fn(),
}))

vi.mock('../hooks/useCaptureIntentListener', () => ({
  useCaptureIntentListener: vi.fn(),
}))

describe('Auth onboarding flow', () => {
  beforeEach(() => {
    cleanup()
    seededUsers.clear()
    runtimeState.user = null
    runtimeState.session = null
    runtimeState.profile = null
  })

  it('requires onboarding for default-password user, then allows re-login after username + new password', async () => {
    const seeded = seedUserWithDefaultPassword({
      email: 'newuser@example.com',
      password: 'DefaultTemp#123',
    })

    render(
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: seeded.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'DefaultTemp#123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(runtimeState.user?.email).toBe(seeded.email)
      expect(runtimeState.profile?.has_set_username).toBe(false)
    })

    cleanup()

    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Routes>
          <Route element={<IdentityGate />}>
            <Route path="/gallery" element={<div>Gallery</div>} />
            <Route path="/reset-password" element={<div>Onboarding required</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Onboarding required')).toBeInTheDocument()

    cleanup()

    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'new_person' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'MyNewPassword#456' },
    })
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'MyNewPassword#456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))

    await waitFor(() => {
      expect(seededUsers.get(seeded.email)?.username).toBe('new_person')
      expect(seededUsers.get(seeded.email)?.password).toBe('MyNewPassword#456')
      expect(runtimeState.profile?.has_set_username).toBe(true)
    })

    await performLogout()

    cleanup()

    render(
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: seeded.email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'MyNewPassword#456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(runtimeState.user?.email).toBe(seeded.email)
      expect(runtimeState.profile?.has_set_username).toBe(true)
      expect(runtimeState.profile?.username).toBe('new_person')
    })

    cleanup()

    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Routes>
          <Route element={<IdentityGate />}>
            <Route path="/gallery" element={<div>Gallery</div>} />
            <Route path="/reset-password" element={<div>Onboarding required</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Gallery')).toBeInTheDocument()
  })
})
