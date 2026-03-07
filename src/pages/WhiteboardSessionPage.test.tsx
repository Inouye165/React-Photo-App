import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WhiteboardSessionPage from './WhiteboardSessionPage'

const {
  ensureWhiteboardMembership,
  createWhiteboardInvite,
  getWhiteboardSessionDetails,
  updateWhiteboardTitle,
  addRoomMember,
  listRoomMembers,
  searchUsers,
} = vi.hoisted(() => ({
  ensureWhiteboardMembership: vi.fn(),
  createWhiteboardInvite: vi.fn(),
  getWhiteboardSessionDetails: vi.fn(),
  updateWhiteboardTitle: vi.fn(),
  addRoomMember: vi.fn(),
  listRoomMembers: vi.fn(),
  searchUsers: vi.fn(),
}))

vi.mock('../api/whiteboards', () => ({
  ensureWhiteboardMembership,
  createWhiteboardInvite,
  getWhiteboardSessionDetails,
  updateWhiteboardTitle,
}))

vi.mock('../api/chat', () => ({
  addRoomMember,
  listRoomMembers,
  searchUsers,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}))

vi.mock('../components/ChessUserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
}))

vi.mock('../components/rooms/RoomMembersModal', () => ({
  default: () => null,
}))

vi.mock('../components/whiteboard/RightSidePanel', () => ({
  default: () => <div data-testid="right-side-panel" />,
}))

vi.mock('../components/whiteboard/WhiteboardPad', async () => {
  const ReactModule = await import('react')
  return {
    default: ReactModule.forwardRef((_props, _ref) => <div data-testid="whiteboard-pad" />),
  }
})

describe('WhiteboardSessionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    ensureWhiteboardMembership.mockResolvedValue({ ok: true })
    createWhiteboardInvite.mockResolvedValue({ joinUrl: 'https://example.com/join', expiresAt: new Date().toISOString() })
    getWhiteboardSessionDetails.mockResolvedValue({
      id: 'board-1',
      name: 'Whiteboard',
      created_by: 'user-1',
      created_at: '2026-03-06T00:00:00.000Z',
      updated_at: '2026-03-06T00:00:00.000Z',
    })
    updateWhiteboardTitle.mockResolvedValue(undefined)
    addRoomMember.mockResolvedValue(undefined)
    searchUsers.mockResolvedValue([])
    listRoomMembers.mockResolvedValue([
      {
        user_id: 'user-1',
        username: 'ron',
        avatar_url: null,
        is_owner: true,
      },
    ])
  })

  it('allows the owner to rename the whiteboard from the session header', async () => {
    render(
      <MemoryRouter initialEntries={["/whiteboards/board-1"]}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Rename whiteboard' })).toBeInTheDocument()
    })

    expect(screen.getByText('Whiteboard')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rename whiteboard' }))

    const input = screen.getByRole('textbox', { name: 'Whiteboard name' })
    fireEvent.change(input, { target: { value: 'Sprint Plan' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(updateWhiteboardTitle).toHaveBeenCalledWith('board-1', 'Sprint Plan')
    })

    expect(screen.getByText('Sprint Plan')).toBeInTheDocument()
  })

  it('does not expose rename controls to non-owners', async () => {
    getWhiteboardSessionDetails.mockResolvedValueOnce({
      id: 'board-1',
      name: 'Shared Board',
      created_by: 'owner-2',
      created_at: '2026-03-06T00:00:00.000Z',
      updated_at: '2026-03-06T00:00:00.000Z',
    })
    listRoomMembers.mockResolvedValueOnce([
      {
        user_id: 'user-1',
        username: 'ron',
        avatar_url: null,
        is_owner: false,
      },
    ])

    render(
      <MemoryRouter initialEntries={["/whiteboards/board-1"]}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Shared Board')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Rename whiteboard' })).not.toBeInTheDocument()
  })
})