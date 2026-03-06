import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WhiteboardSessionPage from './WhiteboardSessionPage'

const ensureWhiteboardMembershipMock = vi.fn()
const createWhiteboardInviteMock = vi.fn()
const listRoomMembersMock = vi.fn()
const searchUsersMock = vi.fn()
const addRoomMemberMock = vi.fn()
const useAuthMock = vi.fn()
const insertImageFileMock = vi.fn()

let roomName = 'Board One'
let roomCreatedBy = 'owner-1'

vi.mock('../api/whiteboards', () => ({
  ensureWhiteboardMembership: (...args: unknown[]) => ensureWhiteboardMembershipMock(...args),
  createWhiteboardInvite: (...args: unknown[]) => createWhiteboardInviteMock(...args),
}))

vi.mock('../api/chat', () => ({
  addRoomMember: (...args: unknown[]) => addRoomMemberMock(...args),
  listRoomMembers: (...args: unknown[]) => listRoomMembersMock(...args),
  searchUsers: (...args: unknown[]) => searchUsersMock(...args),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'rooms') throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { name: roomName, created_by: roomCreatedBy },
              error: null,
            }),
          }),
        }),
      }
    },
  },
}))

vi.mock('../components/whiteboard/WhiteboardPad', () => ({
  default: React.forwardRef(function MockWhiteboardPad(
    { onRealtimeStatusChange }: { onRealtimeStatusChange?: (status: 'connected' | 'connecting' | 'offline') => void },
    ref: React.ForwardedRef<{ insertImageFile: (file: File) => Promise<void> }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      insertImageFile: insertImageFileMock,
    }))
    onRealtimeStatusChange?.('connected')
    return <div data-testid="whiteboard-pad">WhiteboardPad</div>
  }),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/whiteboards/board-1']}>
      <Routes>
        <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WhiteboardSessionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    roomName = 'Board One'
    roomCreatedBy = 'owner-1'

    ensureWhiteboardMembershipMock.mockResolvedValue({ ok: true })
    createWhiteboardInviteMock.mockResolvedValue({ joinUrl: 'http://localhost/whiteboards/join/token-123', expiresAt: new Date(Date.now() + 3600_000).toISOString() })
    listRoomMembersMock.mockResolvedValue([
      { user_id: 'user-1', username: 'Ari', avatar_url: null, is_owner: false },
      { user_id: 'user-2', username: 'Blair', avatar_url: null, is_owner: false },
    ])
    searchUsersMock.mockResolvedValue([])
    addRoomMemberMock.mockResolvedValue(undefined)
    insertImageFileMock.mockResolvedValue(undefined)

    useAuthMock.mockReturnValue({ user: { id: 'user-1' } })
  })

  it('renders Invite button in whiteboard header', async () => {
    renderPage()

    expect(await screen.findByRole('button', { name: 'Invite' })).toBeInTheDocument()
  })

  it('shows only-owner message when a non-owner clicks Invite', async () => {
    const user = userEvent.setup()
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    renderPage()

    const inviteButton = await screen.findByRole('button', { name: 'Invite' })
    await user.click(inviteButton)

    expect(await screen.findByText('Only the owner can invite.')).toBeInTheDocument()

    await user.click(inviteButton)
    await waitFor(() => {
      expect(infoSpy).toHaveBeenCalledTimes(1)
    })

    infoSpy.mockRestore()
  })

  it('shows Create join link button for owner', async () => {
    roomCreatedBy = 'user-1'

    renderPage()

    expect(await screen.findByRole('button', { name: 'Create join link' })).toBeInTheDocument()
  })

  it('forwards selected photos from the header control into the whiteboard canvas handle', async () => {
    const { container } = renderPage()

    await screen.findByRole('button', { name: 'Upload or take photo' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(input).not.toBeNull()

    const file = new File(['whiteboard-photo'], 'problem.png', { type: 'image/png' })
    fireEvent.change(input!, { target: { files: [file] } })

    await waitFor(() => {
      expect(insertImageFileMock).toHaveBeenCalledWith(file)
    })
  })
})
