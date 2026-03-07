import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WhiteboardSessionPage from './WhiteboardSessionPage'

const TEXT_MODE_PLACEHOLDER = 'The Weekend Problem\n\nSara has 3 apples...\n\nHow many apples does she have left?'

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
}

function installMatchMediaMock(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => {
      const minWidthMatch = query.match(/min-width:\s*(\d+)px/)
      const maxWidthMatch = query.match(/max-width:\s*(\d+)px/)
      const minWidth = minWidthMatch ? Number(minWidthMatch[1]) : null
      const maxWidth = maxWidthMatch ? Number(maxWidthMatch[1]) : null
      const matches = query.includes('prefers-reduced-motion')
        ? false
        : (minWidth === null || window.innerWidth >= minWidth) && (maxWidth === null || window.innerWidth <= maxWidth)

      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList
    }),
  })
}

const {
  analyzeWhiteboardPhoto,
  ensureWhiteboardMembership,
  createWhiteboardInvite,
  getWhiteboardSessionDetails,
  updateWhiteboardTitle,
  addRoomMember,
  listRoomMembers,
  searchUsers,
} = vi.hoisted(() => ({
  analyzeWhiteboardPhoto: vi.fn(),
  ensureWhiteboardMembership: vi.fn(),
  createWhiteboardInvite: vi.fn(),
  getWhiteboardSessionDetails: vi.fn(),
  updateWhiteboardTitle: vi.fn(),
  addRoomMember: vi.fn(),
  listRoomMembers: vi.fn(),
  searchUsers: vi.fn(),
}))

const whiteboardPadState = vi.hoisted(() => ({
  hasBackground: false,
  asset: null as null | { dataUrl: string; mimeType: string; name: string },
  clearBackground: vi.fn(),
}))

vi.mock('../api/whiteboards', () => ({
  analyzeWhiteboardPhoto,
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
  default: (props: any) => (
    <div data-testid="right-side-panel">
      <input
        aria-label="Response age"
        value={props.responseAge ?? ''}
        onChange={(event) => props.onResponseAgeChange?.(event.target.value)}
      />
      <button type="button" onClick={() => props.onStartAnalysis?.()}>
        Start analysis
      </button>
    </div>
  ),
}))

vi.mock('../components/whiteboard/WhiteboardPad', async () => {
  const ReactModule = await import('react')
  return {
    default: ReactModule.forwardRef((props: any, ref) => {
      ReactModule.useEffect(() => {
        props.onHasBackgroundChange?.(whiteboardPadState.hasBackground)
        props.onBackgroundImageAssetChange?.(whiteboardPadState.asset)
      }, [])

      ReactModule.useImperativeHandle(ref, () => ({
        clearBackground: whiteboardPadState.clearBackground,
        insertImageFile: vi.fn(),
        setAnnotationTool: vi.fn(),
      }))

      return <div data-testid="whiteboard-pad" />
    }),
  }
})

describe('WhiteboardSessionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setViewport(1280)
    installMatchMediaMock()
    whiteboardPadState.hasBackground = false
    whiteboardPadState.asset = null
    whiteboardPadState.clearBackground.mockReset()

    analyzeWhiteboardPhoto.mockResolvedValue({
      reply: 'Problem: Solve 2x = 10\n\nSteps Analysis:\n1. Dividing both sides by 2 is correct.\n\nErrors Found: None.\n\nEncouragement: Nice work.',
      messages: [{ role: 'assistant', content: 'Problem: Solve 2x = 10' }],
      sections: {
        problem: 'Solve 2x = 10',
        stepsAnalysis: '1. Dividing both sides by 2 is correct.',
        errorsFound: '',
        encouragement: 'Nice work.',
      },
      problem: 'Solve 2x = 10',
      correctSolution: 'x = 5',
      scoreCorrect: 1,
      scoreTotal: 1,
      steps: [
        {
          number: 1,
          label: 'Divide both sides by 2',
          studentWork: '2x ÷ 2 = 10 ÷ 2',
          correct: true,
          neutral: false,
          explanation: 'You divided both sides by 2 correctly.',
        },
      ],
      errorsFound: [],
      closingEncouragement: 'Nice work.',
    })
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

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sprint Plan' })).toBeInTheDocument()
    })
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

  it('shows the decluttered annotation toolbar when a background photo is present without auto-starting tutor analysis', async () => {
    whiteboardPadState.hasBackground = true
    whiteboardPadState.asset = {
      dataUrl: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
      name: 'math.png',
    }

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /invite/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
    expect(screen.getByText('Pen')).toBeInTheDocument()
    expect(screen.getByText('Highlighter')).toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(analyzeWhiteboardPhoto).not.toHaveBeenCalled()
  })

  it('passes the optional response age to the tutor request', async () => {
    whiteboardPadState.hasBackground = true
    whiteboardPadState.asset = {
      dataUrl: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
      name: 'math.png',
    }

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('right-side-panel')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Response age' }), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start analysis' }))

    await waitFor(() => {
      expect(analyzeWhiteboardPhoto).toHaveBeenCalledWith(
        'board-1',
        expect.objectContaining({
          audienceAge: 8,
          imageDataUrl: 'data:image/png;base64,AAAA',
          imageMimeType: 'image/png',
          imageName: 'math.png',
          mode: 'analysis',
        }),
      )
    })
  })

  it('requires confirmation before removing the photo', async () => {
    whiteboardPadState.hasBackground = true
    whiteboardPadState.asset = {
      dataUrl: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
      name: 'math.png',
    }

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }))

    expect(screen.getByText("Remove this photo? This can't be undone.")).toBeInTheDocument()
    expect(whiteboardPadState.clearBackground).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText("Remove this photo? This can't be undone.")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Remove' }))

    expect(whiteboardPadState.clearBackground).toHaveBeenCalledTimes(1)
  })

  it('uses the mobile header, toolbar toggle, and overflow menu under 768px', async () => {
    setViewport(390)
    whiteboardPadState.hasBackground = true
    whiteboardPadState.asset = {
      dataUrl: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
      name: 'math.png',
    }

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show toolbar' })).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /^Invite$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Share$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Homework' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI Tutor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change Photo/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show toolbar' }))

    expect(screen.getByText('Pen')).toBeInTheDocument()
    expect(screen.getByText('Highlighter')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))

    expect(screen.getByRole('menuitem', { name: 'Invite' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy board link' })).toBeInTheDocument()
  })

  it('switches from homework to the AI tutor tab when the mobile analyze button is tapped', async () => {
    setViewport(390)
    whiteboardPadState.hasBackground = true
    whiteboardPadState.asset = {
      dataUrl: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
      name: 'math.png',
    }

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analyze photo' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Analyze photo' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /See Homework/i })).toBeInTheDocument()
    })

    expect(analyzeWhiteboardPhoto).toHaveBeenCalledWith(
      'board-1',
      expect.objectContaining({
        imageName: 'math.png',
        mode: 'analysis',
      }),
    )
  })

  it('shows the updated mobile homework empty state when no photo is loaded', async () => {
    setViewport(390)
    const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Add Your Homework')).toBeInTheDocument()
    })

    expect(screen.getByText('Take a photo or upload from your camera roll')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Photo' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add Photo' }))
    expect(inputClickSpy).toHaveBeenCalled()

    inputClickSpy.mockRestore()
  })

  it('submits typed homework text from the mobile homework tab', async () => {
    setViewport(390)

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Type or paste instead/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Type or paste instead/i }))
    fireEvent.change(screen.getByLabelText('Your Problem'), {
      target: { value: 'Solve 5x + 10 = 35' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze problem' }))

    await waitFor(() => {
      expect(analyzeWhiteboardPhoto).toHaveBeenCalled()
    })

    expect(analyzeWhiteboardPhoto).toHaveBeenCalledWith(
      'board-1',
      expect.objectContaining({
        inputMode: 'text',
        textContent: 'Solve 5x + 10 = 35',
        mode: 'analysis',
      }),
    )
    expect(analyzeWhiteboardPhoto.mock.calls.at(-1)?.[1]).not.toHaveProperty('imageDataUrl')
  })

  it('switches the desktop whiteboard into text input mode', async () => {
    setViewport(1280)

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Switch to text input/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Switch to text input/i }))

    const desktopTextarea = document.querySelector('textarea')
    expect(desktopTextarea).not.toBeNull()
    expect(desktopTextarea).toHaveAttribute('placeholder', TEXT_MODE_PLACEHOLDER)
  })

  it('shows the structured example placeholder in mobile text mode', async () => {
    setViewport(390)

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Type or paste instead/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Type or paste instead/i }))

    expect(screen.getByLabelText('Your Problem')).toHaveAttribute('placeholder', TEXT_MODE_PLACEHOLDER)
  })
})