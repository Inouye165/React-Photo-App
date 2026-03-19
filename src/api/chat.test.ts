import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock, getAuthHeadersAsyncMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  getAuthHeadersAsyncMock: vi.fn(),
}))

vi.mock('./httpClient', () => ({
  API_BASE_URL: 'https://example.test',
  request: (...args: unknown[]) => requestMock(...args),
}))

vi.mock('./auth', () => ({
  getAuthHeadersAsync: (...args: unknown[]) => getAuthHeadersAsyncMock(...args),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}))

vi.mock('./activity', () => ({
  logActivity: vi.fn(),
}))

import { sendMessage } from './chat'

describe('chat.sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthHeadersAsyncMock.mockResolvedValue({ Authorization: 'Bearer token' })
  })

  it('posts messages through the server chat endpoint', async () => {
    requestMock.mockResolvedValue({
      id: 'message-1',
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'hello',
      photo_id: null,
      created_at: '2026-03-19T00:00:00.000Z',
    })

    await expect(sendMessage('room-1', ' hello ')).resolves.toMatchObject({
      id: 'message-1',
      room_id: 'room-1',
      content: 'hello',
    })

    expect(getAuthHeadersAsyncMock).toHaveBeenCalledWith(true)
    expect(requestMock).toHaveBeenCalledWith({
      path: '/api/v1/chat/rooms/room-1/messages',
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: {
        content: 'hello',
        photoId: null,
      },
    })
  })
})
