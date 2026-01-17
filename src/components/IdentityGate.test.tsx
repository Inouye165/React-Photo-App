import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import IdentityGate from './IdentityGate.tsx'
import { useAuth } from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../hooks/usePhotoProcessingEvents', () => ({
  usePhotoProcessingEvents: vi.fn(),
}))

vi.mock('../hooks/useCaptureIntentListener', () => ({
  useCaptureIntentListener: vi.fn(),
}))

describe('IdentityGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows access to /reset-password even when username is missing', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '123' },
      authReady: true,
      profile: { has_set_username: false },
      profileLoading: false,
      profileError: null,
    } as any)

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route element={<IdentityGate />}>
            <Route path="/reset-password" element={<div>Account setup</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Account setup')).toBeInTheDocument()
  })
})
