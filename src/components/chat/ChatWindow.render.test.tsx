import { render, screen } from '@testing-library/react'
import ChatWindow from './ChatWindow'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock hooks to avoid network/supabase interactions (use Vitest `vi`)
vi.mock('../../hooks/useChatRealtime', () => ({
  useChatRealtime: () => ({ messages: [], loading: false, error: null, upsertLocalMessage: () => {} }),
}))
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => ({ isUserOnline: () => false }) }))
vi.mock('../../hooks/useChatTyping', () => ({ useChatTyping: () => ({ typingUsernames: [], handleInputChange: () => {}, handleInputSubmit: () => {} }) }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, profile: null }) }))

describe('ChatWindow (render)', () => {
  it('renders composer when roomId provided', () => {
    render(
      <MemoryRouter>
        <ChatWindow roomId="room-1" mode="conversation" />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('chat-composer')).toBeInTheDocument()
    expect(screen.getByTestId('chat-composer-input')).toBeInTheDocument()
    expect(screen.getByTestId('chat-composer-send')).toBeInTheDocument()
  })
})
