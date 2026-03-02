import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
})
