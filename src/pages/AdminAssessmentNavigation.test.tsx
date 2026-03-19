// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

let mockAuthState: any = {
  user: { id: 'admin-user', app_metadata: { role: 'admin' } },
}

const requestMock = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

vi.mock('../api/httpClient', () => ({
  request: (args: any) => requestMock(args),
  ApiError: class ApiError extends Error {},
}))

vi.mock('../api/auth', () => ({
  getAuthHeadersAsync: vi.fn(async () => ({ Authorization: 'Bearer test' })),
}))

import AdminAssessmentHistory from './AdminAssessmentHistory'
import AssessmentReviewDetail from './AssessmentReviewDetail'

describe('Assessment admin navigation', () => {
  beforeEach(() => {
    mockAuthState = {
      user: { id: 'admin-user', app_metadata: { role: 'admin' } },
    }

    requestMock.mockReset()
    requestMock.mockImplementation((args: { path: string }) => {
      if (args.path === '/api/admin/assessments?limit=50&offset=0') {
        return Promise.resolve({ success: true, data: [] })
      }

      if (args.path === '/api/admin/assessments/abc123') {
        return Promise.resolve({
          success: true,
          data: {
            id: 'abc123',
            status: 'pending_review',
            commit_hash: null,
            final_grade: null,
            reviewer_id: null,
            notes: '',
            created_at: '2026-03-18T00:00:00.000Z',
            updated_at: '2026-03-18T00:00:00.000Z',
            raw_ai_response: {},
            trace_log: {},
          },
        })
      }

      return Promise.resolve({ success: true, data: {} })
    })
  })

  it('adds Back, Admin, and Home actions to assessment history', async () => {
    render(
      <MemoryRouter initialEntries={['/gallery', '/admin/assessments']} initialIndex={1}>
        <Routes>
          <Route path="/gallery" element={<div>Gallery route</div>} />
          <Route path="/admin/assessments" element={<AdminAssessmentHistory />} />
          <Route path="/admin" element={<div>Admin route</div>} />
          <Route path="/" element={<div>Home route</div>} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/admin/assessments?limit=50&offset=0' }))
    })

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Admin Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Admin Dashboard' }))

    await waitFor(() => {
      expect(screen.getByText('Admin route')).toBeInTheDocument()
    })
  })

  it('navigates back from assessment history', async () => {
    render(
      <MemoryRouter initialEntries={['/gallery', '/admin/assessments']} initialIndex={1}>
        <Routes>
          <Route path="/gallery" element={<div>Gallery route</div>} />
          <Route path="/admin/assessments" element={<AdminAssessmentHistory />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => {
      expect(screen.getByText('Gallery route')).toBeInTheDocument()
    })
  })

  it('adds Back, Admin, and Home actions to assessment detail', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/assessments/abc123']}>
        <Routes>
          <Route path="/admin/assessments/:id" element={<AssessmentReviewDetail />} />
          <Route path="/admin" element={<div>Admin route</div>} />
          <Route path="/" element={<div>Home route</div>} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/admin/assessments/abc123' }))
    })

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Admin Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Home' }))

    await waitFor(() => {
      expect(screen.getByText('Home route')).toBeInTheDocument()
    })
  })

  it('shows Back and Home on denied assessment history', () => {
    mockAuthState = {
      user: { id: 'plain-user', app_metadata: { role: 'user' } },
    }

    render(
      <MemoryRouter>
        <AdminAssessmentHistory />
      </MemoryRouter>
    )

    expect(screen.getByText('You do not have permission to view this page.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('shows Back and Home on denied assessment detail', () => {
    mockAuthState = {
      user: { id: 'plain-user', app_metadata: { role: 'user' } },
    }

    render(
      <MemoryRouter initialEntries={['/admin/assessments/abc123']}>
        <Routes>
          <Route path="/admin/assessments/:id" element={<AssessmentReviewDetail />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('You do not have permission to view this page.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })
})