/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatSidebar from '../ChatSidebar'

vi.mock('../../../api', () => ({
  fetchRooms: vi.fn(async () => [
    { id: 'r1', name: 'General', is_group: true, created_at: new Date().toISOString(), type: 'chat', metadata: {} },
    { id: 'wb1', name: 'Board', is_group: true, created_at: new Date().toISOString(), type: 'whiteboard', metadata: {} },
  ]),
  createGroupRoom: vi.fn(),
  getOrCreateRoom: vi.fn(),
  searchUsers: vi.fn(),
}))

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

describe('ChatSidebar - hides whiteboards', () => {
  it('does not render whiteboard rooms', async () => {
    render(<ChatSidebar selectedRoomId={null} onSelectRoom={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId('chat-room-r1')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('chat-room-wb1')).toBeNull()
  })
})
