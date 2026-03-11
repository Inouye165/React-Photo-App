import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TutorQueuePage from './TutorQueuePage'

const { claimWhiteboardHelpRequest, listTutorQueueRequests } = vi.hoisted(() => ({
  claimWhiteboardHelpRequest: vi.fn(),
  listTutorQueueRequests: vi.fn(),
}))

const mockAuthState = vi.hoisted(() => ({
  value: {
    user: { id: 'tutor-1', app_metadata: { is_tutor: true } },
    profile: { is_tutor: true },
  },
}))

vi.mock('../api/whiteboards', () => ({
  claimWhiteboardHelpRequest,
  listTutorQueueRequests,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState.value,
}))

describe('TutorQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const pendingRequests = [
      {
        id: 'request-1',
        boardId: 'board-1',
        studentUserId: 'student-1',
        studentUsername: 'Student One',
        claimedByUserId: null,
        claimedByUsername: null,
        requestText: 'Please help with fractions',
        problemDraft: '3/4 + 1/8',
        status: 'pending',
        createdAt: '2026-03-10T12:00:00.000Z',
        updatedAt: '2026-03-10T12:00:00.000Z',
        claimedAt: null,
        resolvedAt: null,
        boardName: 'Fractions board',
      },
    ]

    const claimedRequests: Array<Record<string, unknown>> = []

    listTutorQueueRequests.mockImplementation(async (options?: { status?: 'pending' | 'claimed'; mine?: boolean }) => {
      if (options?.status === 'claimed') {
        return claimedRequests
      }

      return pendingRequests
    })

    claimWhiteboardHelpRequest.mockResolvedValue({
      id: 'request-1',
      boardId: 'board-1',
      studentUserId: 'student-1',
      studentUsername: 'Student One',
      claimedByUserId: 'tutor-1',
      claimedByUsername: 'Tutor One',
      requestText: 'Please help with fractions',
      problemDraft: '3/4 + 1/8',
      status: 'claimed',
      createdAt: '2026-03-10T12:00:00.000Z',
      updatedAt: '2026-03-10T12:01:00.000Z',
      claimedAt: '2026-03-10T12:01:00.000Z',
      resolvedAt: null,
      boardName: 'Fractions board',
    })

    claimWhiteboardHelpRequest.mockImplementation(async () => {
      const claimed = {
        id: 'request-1',
        boardId: 'board-1',
        studentUserId: 'student-1',
        studentUsername: 'Student One',
        claimedByUserId: 'tutor-1',
        claimedByUsername: 'Tutor One',
        requestText: 'Please help with fractions',
        problemDraft: '3/4 + 1/8',
        status: 'claimed',
        createdAt: '2026-03-10T12:00:00.000Z',
        updatedAt: '2026-03-10T12:01:00.000Z',
        claimedAt: '2026-03-10T12:01:00.000Z',
        resolvedAt: null,
        boardName: 'Fractions board',
      }

      pendingRequests.splice(0, pendingRequests.length)
      claimedRequests.splice(0, claimedRequests.length, claimed)
      return claimed
    })
  })

  it('moves a claimed request into the claimed-by-you column immediately', async () => {
    render(
      <MemoryRouter>
        <TutorQueuePage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Fractions board')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Claim' }))

    await waitFor(() => {
      expect(claimWhiteboardHelpRequest).toHaveBeenCalledWith('request-1')
    })

    await waitFor(() => {
      expect(screen.getByText('Claimed Fractions board. It is now in your queue.')).toBeInTheDocument()
    })

    const waitingSection = screen.getByText('Waiting now').closest('section')
    const claimedSection = screen.getByText('Claimed by you').closest('section')

    expect(waitingSection).not.toBeNull()
    expect(claimedSection).not.toBeNull()
    expect(waitingSection).toHaveTextContent('No students are waiting right now.')
    expect(claimedSection).toHaveTextContent('Fractions board')
    expect(claimedSection).toHaveTextContent('Please help with fractions')
  })
})
