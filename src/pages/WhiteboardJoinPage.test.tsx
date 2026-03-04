import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import WhiteboardJoinPage from './WhiteboardJoinPage'

const joinWhiteboardByTokenMock = vi.fn()

vi.mock('../api/whiteboards', () => ({
  joinWhiteboardByToken: (...args: unknown[]) => joinWhiteboardByTokenMock(...args),
}))

function BoardView() {
  const { boardId } = useParams()
  return <div>Board {boardId}</div>
}

describe('WhiteboardJoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls join API and navigates on success', async () => {
    joinWhiteboardByTokenMock.mockResolvedValue({ roomId: 'room-abc' })

    render(
      <MemoryRouter initialEntries={['/whiteboards/join/token-123']}>
        <Routes>
          <Route path="/whiteboards/join/:token" element={<WhiteboardJoinPage />} />
          <Route path="/whiteboards/:boardId" element={<BoardView />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(joinWhiteboardByTokenMock).toHaveBeenCalledWith('token-123')
    })

    expect(await screen.findByText('Board room-abc')).toBeInTheDocument()
  })

  it('navigates when token comes from query string under StrictMode', async () => {
    joinWhiteboardByTokenMock.mockResolvedValue({ roomId: 'room-query' })

    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/whiteboards/board-1/join?token=token-query-123']}>
          <Routes>
            <Route path="/whiteboards/:boardId/join" element={<WhiteboardJoinPage />} />
            <Route path="/whiteboards/:boardId" element={<BoardView />} />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>,
    )

    await waitFor(() => {
      expect(joinWhiteboardByTokenMock).toHaveBeenCalledWith('token-query-123')
    })

    expect(await screen.findByText('Board room-query')).toBeInTheDocument()
  })
})
