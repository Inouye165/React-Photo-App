import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import OnboardingPage from './OnboardingPage'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submitting setup calls updatePassword and updateProfile (new user)', async () => {
    const mockUpdatePassword = vi.fn().mockResolvedValue({ success: true })
    const mockUpdateProfile = vi.fn().mockResolvedValue({ success: true })

    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: false },
      profileLoading: false,
      updatePassword: mockUpdatePassword,
      updateProfile: mockUpdateProfile,
    } as any)

    render(
      <BrowserRouter>
        <OnboardingPage />
      </BrowserRouter>
    )

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newuser' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith('password123')
      expect(mockUpdateProfile).toHaveBeenCalledWith('newuser')
    })

    expect(screen.getByText('Account Created')).toBeInTheDocument()
  })

  it('shows error and does not navigate when updateProfile fails after password succeeds', async () => {
    const mockUpdatePassword = vi.fn().mockResolvedValue({ success: true })
    const mockUpdateProfile = vi.fn().mockResolvedValue({ success: false, error: 'Username already taken' })

    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: false },
      profileLoading: false,
      updatePassword: mockUpdatePassword,
      updateProfile: mockUpdateProfile,
    } as any)

    render(
      <BrowserRouter>
        <OnboardingPage />
      </BrowserRouter>
    )

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newuser' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith('password123')
      expect(mockUpdateProfile).toHaveBeenCalledWith('newuser')
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Username already taken')
    expect(mockNavigate).not.toHaveBeenCalledWith('/gallery')
  })
})
