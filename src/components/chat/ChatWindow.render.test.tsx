import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ChatWindow from './ChatWindow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement, ReactNode } from 'react'

const testState = vi.hoisted(() => {
  const senderUser = { id: 'user-sender', username: 'Sender User' }
  const receiverUser = { id: 'user-receiver', username: 'Receiver User' }
  let persistedMessages: Array<{
    id: number
    room_id: string
    sender_id: string
    content: string
    photo_id: number | null
    created_at: string
  }> = []
  let nextId = 100
  let activeSendUserId = senderUser.id

  return {
    senderUser,
    receiverUser,
    reset() {
      persistedMessages = []
      nextId = 100
      activeSendUserId = senderUser.id
    },
    setActiveSendUserId(userId: string) {
      activeSendUserId = userId
    },
    persistMessage(roomId: string, content: string, photoId: number | null) {
      const message = {
        id: nextId++,
        room_id: roomId,
        sender_id: activeSendUserId,
        content,
        photo_id: photoId,
        created_at: new Date(Date.UTC(2026, 2, 19, 19, 0, nextId)).toISOString(),
      }
      persistedMessages = [...persistedMessages, message]
      return { ...message }
    },
    readMessages() {
      return persistedMessages.map((message) => ({ ...message }))
    },
  }
})

vi.mock('../../api', () => ({
  API_BASE_URL: 'http://localhost:3001',
  getAccessToken: () => Promise.resolve('token'),
  getPhotos: vi.fn(),
  patchChatRoom: vi.fn(),
  leaveOrDeleteRoom: vi.fn(),
  sendMessage: vi.fn(async (roomId: string, content: string, photoId: number | null) => {
    return testState.persistMessage(roomId, content, photoId)
  }),
}))

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'room_members') {
        return {
          select: (query: string) => ({
            eq: () => {
              if (query === 'user_id, is_owner') {
                return Promise.resolve({
                  data: [
                    { user_id: testState.senderUser.id, is_owner: true },
                    { user_id: testState.receiverUser.id, is_owner: false },
                  ],
                  error: null,
                })
              }

              if (query === 'user_id') {
                return {
                  neq: (_column: string, userId: string) => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: { user_id: userId === testState.senderUser.id ? testState.receiverUser.id : testState.senderUser.id },
                        error: null,
                      }),
                    }),
                  }),
                }
              }

              return Promise.resolve({ data: [], error: null })
            },
          }),
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        }
      }

      if (table === 'users') {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: ids.map((id) => ({
                id,
                username: id === testState.senderUser.id ? testState.senderUser.username : testState.receiverUser.username,
                avatar_url: null,
              })),
              error: null,
            }),
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => ({
                data: {
                  id,
                  username: id === testState.senderUser.id ? testState.senderUser.username : testState.receiverUser.username,
                },
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'rooms') {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => ({
                data: {
                  id,
                  name: 'Shared room',
                  is_group: true,
                  type: 'general',
                  metadata: {},
                  created_by: testState.senderUser.id,
                },
                error: null,
              }),
            }),
          }),
        }
      }

      return {
        select: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      }
    },
  },
}))

vi.mock('../../hooks/useChatRealtime', () => ({
  useChatRealtime: (_roomId: string | null, { userId }: { userId: string | null }) => {
    const React = require('react') as typeof import('react')

    const normalizeMessage = (message: {
      id: string | number
      room_id: string | number
      sender_id: string | number
      content: string
      photo_id: string | number | null
      created_at: string
    }) => ({
      id: String(message.id),
      room_id: String(message.room_id),
      sender_id: String(message.sender_id),
      content: message.content,
      photo_id: message.photo_id == null ? null : Number(message.photo_id),
      created_at: message.created_at,
    })

    const isReceiver = userId === testState.receiverUser.id
    const [messages, setMessages] = React.useState(() => testState.readMessages().map(normalizeMessage))
    const [error, setError] = React.useState<string | null>(() => (isReceiver && testState.readMessages().length === 0 ? 'Realtime degraded' : null))

    const refetchMessages = React.useCallback(async () => {
      setMessages(testState.readMessages().map(normalizeMessage))
      setError(null)
    }, [])

    const upsertLocalMessage = React.useCallback((message: Parameters<typeof normalizeMessage>[0]) => {
      const normalized = normalizeMessage(message)
      setMessages((current) => {
        if (current.some((entry) => entry.id === normalized.id)) return current
        return [...current, normalized]
      })
    }, [])

    React.useEffect(() => {
      if (!isReceiver) return undefined

      const onFocus = () => {
        void refetchMessages()
      }

      window.addEventListener('focus', onFocus)
      return () => window.removeEventListener('focus', onFocus)
    }, [isReceiver, refetchMessages])

    return { messages, loading: false, error, upsertLocalMessage, refetchMessages }
  },
}))
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => ({ isUserOnline: () => false }) }))
vi.mock('../../hooks/useChatTyping', () => ({ useChatTyping: () => ({ typingUsernames: [], handleInputChange: () => {}, handleInputSubmit: () => {} }) }))
vi.mock('../../contexts/AuthContext', () => {
  const React = require('react') as typeof import('react')
  const TestAuthContext = React.createContext<{ user: { id: string } | null; profile: { username?: string | null } | null }>({ user: null, profile: null })

  return {
    TestAuthProvider: ({ value, children }: { value: { user: { id: string } | null; profile: { username?: string | null } | null }; children: React.ReactNode }) => (
      <TestAuthContext.Provider value={value}>{children}</TestAuthContext.Provider>
    ),
    useAuth: () => React.useContext(TestAuthContext),
  }
})
vi.mock('../AuthenticatedImage', () => ({ default: () => null }))
vi.mock('./ChatBubble', () => ({
  default: ({ message, senderLabel }: { message: { content: string; id: string | number }; senderLabel: string }) => (
    <div data-testid={`chat-bubble-${message.id}`}>{senderLabel}: {message.content}</div>
  ),
}))
vi.mock('./ChatMembersModal', () => ({ default: () => null }))
vi.mock('./ChatSettingsModal', () => ({ default: () => null }))
vi.mock('./ChatRoomInfoPanel', () => ({ default: () => null }))
vi.mock('./widgets/PotluckWidget', () => ({ default: () => null }))
vi.mock('../whiteboard/WhiteboardViewer', () => ({ default: () => null }))
vi.mock('../IdentityGate', () => ({
  IdentityGateInline: () => null,
  useIdentityGateStatus: () => ({ type: 'allow' }),
}))

import { sendMessage } from '../../api'
import * as AuthContextModule from '../../contexts/AuthContext'

const { TestAuthProvider } = AuthContextModule as typeof AuthContextModule & {
  TestAuthProvider: ({
    value,
    children,
  }: {
    value: { user: { id: string } | null; profile: { username?: string | null } | null }
    children: ReactNode
  }) => ReactElement
}

function renderChatWindowForUser(user: { id: string; username: string }) {
  return render(
    <TestAuthProvider value={{ user: { id: user.id }, profile: { username: user.username } }}>
      <MemoryRouter>
        <ChatWindow roomId="room-1" mode="conversation" />
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

describe('ChatWindow (render)', () => {
  beforeEach(() => {
    testState.reset()
    vi.clearAllMocks()
  })

  it('renders composer when roomId provided', () => {
    render(
      <TestAuthProvider value={{ user: null, profile: null }}>
        <MemoryRouter>
          <ChatWindow roomId="room-1" mode="conversation" />
        </MemoryRouter>
      </TestAuthProvider>,
    )
    expect(screen.getByTestId('chat-composer')).toBeInTheDocument()
    expect(screen.getByTestId('chat-composer-input')).toBeInTheDocument()
    expect(screen.getByTestId('chat-composer-send')).toBeInTheDocument()
  })

  it('recovers a newly sent shared-chat message for a receiver that missed realtime and still keeps it after reload', async () => {
    const receiverView = renderChatWindowForUser(testState.receiverUser)
    const senderView = renderChatWindowForUser(testState.senderUser)

    expect(within(receiverView.container).queryByText(/student-recovery-message/i)).not.toBeInTheDocument()
    expect(within(receiverView.container).getByText(/Failed to load messages: Realtime degraded/i)).toBeInTheDocument()

    testState.setActiveSendUserId(testState.senderUser.id)
    fireEvent.change(within(senderView.container).getByTestId('chat-composer-input'), {
      target: { value: 'student-recovery-message' },
    })
    fireEvent.click(within(senderView.container).getByTestId('chat-composer-send'))

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith('room-1', 'student-recovery-message', null)
    })

    await waitFor(() => {
      expect(within(senderView.container).getByText('Sender User: student-recovery-message')).toBeInTheDocument()
    })

    expect(within(receiverView.container).queryByText('Sender User: student-recovery-message')).not.toBeInTheDocument()

    fireEvent(window, new Event('focus'))

    await waitFor(() => {
      expect(within(receiverView.container).getByText('Sender User: student-recovery-message')).toBeInTheDocument()
    })

    expect(within(receiverView.container).queryByText(/Live updates are recovering/i)).not.toBeInTheDocument()
    expect(within(receiverView.container).queryByText(/Failed to load messages:/i)).not.toBeInTheDocument()

    receiverView.unmount()

    const reloadedReceiverView = renderChatWindowForUser(testState.receiverUser)

    await waitFor(() => {
      expect(within(reloadedReceiverView.container).getByText('Sender User: student-recovery-message')).toBeInTheDocument()
    })
  })
})
