import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WhiteboardsHubPage from './WhiteboardsHubPage'

type MockAuthState = {
  user: { id: string; app_metadata: { is_tutor?: boolean; role?: string } }
  profile: { is_tutor: boolean }
}

const { createWhiteboard, deleteWhiteboard, listMyWhiteboards, listTutorQueueRequests, updateWhiteboardTitle } = vi.hoisted(() => ({
  createWhiteboard: vi.fn(),
  deleteWhiteboard: vi.fn(),
  listMyWhiteboards: vi.fn(),
  listTutorQueueRequests: vi.fn(),
  updateWhiteboardTitle: vi.fn(),
}))

const { listRoomMembers } = vi.hoisted(() => ({
  listRoomMembers: vi.fn(),
}))

const mockAuthState = vi.hoisted(() => ({
  value: {
    user: { id: 'tutor-1', app_metadata: { is_tutor: true } },
    profile: { is_tutor: true },
  } as MockAuthState,
}))

vi.mock('../api/whiteboards', () => ({
  createWhiteboard,
  deleteWhiteboard,
  listMyWhiteboards,
  listTutorQueueRequests,
  updateWhiteboardTitle,
}))

vi.mock('../api/chat', () => ({
  listRoomMembers,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState.value,
}))

vi.mock('../components/ChessUserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}))

describe('WhiteboardsHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listMyWhiteboards.mockResolvedValue([])
    listRoomMembers.mockResolvedValue([])
    listTutorQueueRequests.mockResolvedValue([])
    mockAuthState.value = {
      user: { id: 'tutor-1', app_metadata: { is_tutor: true } },
      profile: { is_tutor: true },
    }
  })

  it('shows a clear help-requests queue button with the live pending count', async () => {
    listTutorQueueRequests.mockResolvedValueOnce([
      { id: 'request-1' },
      { id: 'request-2' },
      { id: 'request-3' },
    ])

    render(
      <MemoryRouter>
        <WhiteboardsHubPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(listTutorQueueRequests).toHaveBeenCalledWith({ status: 'pending' })
    })

    expect(screen.getAllByRole('button', { name: 'Tutor help queue (3)' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Help Requests').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
  })

  it('keeps the queue meaning clear even when there are no pending requests', async () => {
    render(
      <MemoryRouter>
        <WhiteboardsHubPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Tutor help queue (0)' }).length).toBeGreaterThan(0)
    })

    expect(screen.getAllByText('Help Requests').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('hides the tutor help queue button for non-tutor users', async () => {
    mockAuthState.value = {
      user: { id: 'user-1', app_metadata: { role: 'user' } },
      profile: { is_tutor: false },
    }

    render(
      <MemoryRouter>
        <WhiteboardsHubPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(listMyWhiteboards).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByRole('button', { name: /Tutor help queue/i })).not.toBeInTheDocument()
    expect(listTutorQueueRequests).not.toHaveBeenCalled()
  })
})