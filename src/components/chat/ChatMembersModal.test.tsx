import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor, within } from '@testing-library/react'
import ChatMembersModal, { type ChatMemberSummary } from './ChatMembersModal'

const mockAddRoomMember = vi.fn()
const mockRemoveRoomMember = vi.fn()
const mockQuitRoom = vi.fn()
const mockSetRoomOwner = vi.fn()
const mockSearchUsers = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../../api', () => ({
  addRoomMember: (...args: unknown[]) => mockAddRoomMember(...args),
  removeRoomMember: (...args: unknown[]) => mockRemoveRoomMember(...args),
  quitRoom: (...args: unknown[]) => mockQuitRoom(...args),
  setRoomOwner: (...args: unknown[]) => mockSetRoomOwner(...args),
  searchUsers: (...args: unknown[]) => mockSearchUsers(...args),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('lucide-react', () => ({
  X: () => null,
}))

const baseMembers: ChatMemberSummary[] = [
  { userId: 'user-1', username: 'Sam', avatarUrl: null, isOwner: true },
  { userId: 'user-2', username: 'Alex', avatarUrl: null, isOwner: false },
]

describe('ChatMembersModal', () => {
  it('hides privileged controls for non-owners', () => {
    const { container } = render(
      <ChatMembersModal
        isOpen
        onClose={vi.fn()}
        roomId="room-1"
        isGroup
        currentUserId="user-2"
        createdBy="user-1"
        members={baseMembers}
        onRefreshMembers={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const scope = within(container)
    expect(scope.queryByText(/add member/i)).toBeNull()
    expect(scope.queryByRole('button', { name: /remove/i })).toBeNull()
    expect(scope.queryByRole('button', { name: /promote to owner/i })).toBeNull()
  })

  it('allows owners to add a member', async () => {
    mockSearchUsers.mockResolvedValueOnce([
      { id: 'user-3', username: 'Riley', avatar_url: null },
    ])
    mockAddRoomMember.mockResolvedValueOnce(undefined)

    const { container } = render(
      <ChatMembersModal
        isOpen
        onClose={vi.fn()}
        roomId="room-1"
        isGroup
        currentUserId="user-1"
        createdBy="user-1"
        members={baseMembers}
        onRefreshMembers={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const scope = within(container)
    fireEvent.change(scope.getByLabelText(/search users/i), { target: { value: 'ri' } })
    fireEvent.click(scope.getByRole('button', { name: /search/i }))

    await waitFor(() => expect(mockSearchUsers).toHaveBeenCalledWith('ri'))

    fireEvent.click(scope.getByRole('button', { name: /add/i }))

    await waitFor(() => expect(mockAddRoomMember).toHaveBeenCalledWith('room-1', 'user-3'))
  })

  it('quits chat and navigates away', async () => {
    mockQuitRoom.mockResolvedValueOnce(undefined)

    const { container } = render(
      <ChatMembersModal
        isOpen
        onClose={vi.fn()}
        roomId="room-1"
        isGroup
        currentUserId="user-2"
        createdBy="user-1"
        members={baseMembers}
        onRefreshMembers={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const scope = within(container)
    fireEvent.click(scope.getByRole('button', { name: /quit chat/i }))

    await waitFor(() => expect(mockQuitRoom).toHaveBeenCalledWith('room-1'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/chat'))
  })

  it('shows promote controls for the creator only', () => {
    const { container, rerender } = render(
      <ChatMembersModal
        isOpen
        onClose={vi.fn()}
        roomId="room-1"
        isGroup
        currentUserId="user-1"
        createdBy="user-1"
        members={baseMembers}
        onRefreshMembers={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const scope = within(container)
    expect(scope.getByRole('button', { name: /promote to owner/i })).toBeInTheDocument()

    rerender(
      <ChatMembersModal
        isOpen
        onClose={vi.fn()}
        roomId="room-1"
        isGroup
        currentUserId="user-1"
        createdBy="user-2"
        members={baseMembers}
        onRefreshMembers={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(scope.queryByRole('button', { name: /promote to owner/i })).toBeNull()
  })
})
