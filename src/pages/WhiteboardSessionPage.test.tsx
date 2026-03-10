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
  createWhiteboardHelpRequest,
  ensureWhiteboardMembership,
  createWhiteboardInvite,
  getActiveWhiteboardHelpRequest,
  getWhiteboardSessionDetails,
  resolveWhiteboardHelpRequest,
  updateWhiteboardTitle,
  addRoomMember,
  listRoomMembers,
  searchUsers,
} = vi.hoisted(() => ({
  analyzeWhiteboardPhoto: vi.fn(),
  createWhiteboardHelpRequest: vi.fn(),
  ensureWhiteboardMembership: vi.fn(),
  createWhiteboardInvite: vi.fn(),
  getActiveWhiteboardHelpRequest: vi.fn(),
  getWhiteboardSessionDetails: vi.fn(),
  resolveWhiteboardHelpRequest: vi.fn(),
  updateWhiteboardTitle: vi.fn(),
  addRoomMember: vi.fn(),
  listRoomMembers: vi.fn(),
  searchUsers: vi.fn(),
}))

const mockAuthState = vi.hoisted(() => ({
  value: {
    user: { id: 'user-1', app_metadata: { role: 'user' } as { role: string; is_tutor?: boolean } },
    profile: { is_tutor: false },
  },
}))

const whiteboardPadState = vi.hoisted(() => ({
  hasBackground: false,
  asset: null as null | { dataUrl: string; mimeType: string; name: string },
  clearBackground: vi.fn(),
}))

vi.mock('../api/whiteboards', () => ({
  analyzeWhiteboardPhoto,
  createWhiteboardHelpRequest,
  ensureWhiteboardMembership,
  createWhiteboardInvite,
  getActiveWhiteboardHelpRequest,
  getWhiteboardSessionDetails,
  resolveWhiteboardHelpRequest,
  updateWhiteboardTitle,
}))

vi.mock('../api/chat', () => ({
  addRoomMember,
  listRoomMembers,
  searchUsers,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState.value,
}))

vi.mock('../components/ChessUserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
}))

vi.mock('../components/rooms/RoomMembersModal', () => ({
  default: () => null,
}))

vi.mock('../components/whiteboard/RightSidePanel', () => ({
  default: (props: any) => {
    const ReactModule = require('react')

    ReactModule.useEffect(() => {
      if (!props.analysis) return
      props.onLessonMessageChange?.({
        title: 'Here is the lesson plan',
        body: 'Summary: Nice work.',
        tone: 'prompt',
      })
    }, [props.analysis, props.onLessonMessageChange])

    return (
      <div data-testid="right-side-panel" id="whiteboard-side-panel" data-active-tab={props.activeTab ?? props.initialTab ?? ''}>
        <div>Active tab: {props.activeTab ?? props.initialTab ?? ''}</div>
        <div>Panel mode: {props.panelMode ?? 'student'}</div>
        <div>Ready intent: {props.readyIntent ?? 'analyze'}</div>
        <button type="button" onClick={() => props.onReadyIntentChange?.('analyze')}>Set analyze intent</button>
        <button type="button" onClick={() => props.onReadyIntentChange?.('solve')}>Set solve intent</button>
        <button type="button" onClick={() => props.onReadyIntentChange?.('steps')}>Set steps intent</button>
        <textarea
          aria-label="Problem or question"
          value={props.problemDraft ?? ''}
          onChange={(event) => props.onProblemDraftChange?.(event.target.value)}
        />
        <textarea
          aria-label="What do you want help with"
          value={props.helpRequestDraft ?? ''}
          onChange={(event) => props.onHelpRequestDraftChange?.(event.target.value)}
        />
        <input
          aria-label="Response age"
          value={props.responseAge ?? ''}
          onChange={(event) => props.onResponseAgeChange?.(event.target.value)}
        />
        <button type="button" onClick={() => props.onStartAnalysis?.()}>
          Start analysis
        </button>
        <button type="button" onClick={() => props.onSubmitHelpRequest?.()}>
          Send help request
        </button>
      </div>
    )
  },
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
    mockAuthState.value = {
      user: { id: 'user-1', app_metadata: { role: 'user' } },
      profile: { is_tutor: false },
    }
    whiteboardPadState.hasBackground = false
    whiteboardPadState.asset = null
    whiteboardPadState.clearBackground.mockReset()

    analyzeWhiteboardPhoto.mockResolvedValue({
      reply: 'Problem: Solve 2x = 10\n\nSteps Analysis:\n1. Dividing both sides by 2 is correct.\n\nErrors Found: None.\n\nEncouragement: Nice work.',
      messages: [{ role: 'assistant', content: 'Problem: Solve 2x = 10' }],
      analysisResult: {
        problemText: 'Solve 2x = 10',
        finalAnswers: ['x = 5'],
        overallSummary: 'Nice work.',
        regions: [],
        steps: [
          {
            id: 'step-1',
            index: 0,
            studentText: '2x ÷ 2 = 10 ÷ 2',
            normalizedMath: 'x = 5',
            status: 'correct',
            shortLabel: 'Divide both sides by 2',
            kidFriendlyExplanation: 'You divided both sides by 2 correctly.',
          },
        ],
        validatorWarnings: [],
        canAnimate: false,
      },
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
    createWhiteboardHelpRequest.mockResolvedValue({
      id: 'request-1',
      boardId: 'board-1',
      requesterUserId: 'user-1',
      requesterUsername: 'ron',
      requestText: 'Need help',
      problemDraft: '',
      status: 'pending',
      claimedByUserId: null,
      claimedByUsername: null,
      claimedAt: null,
      resolvedAt: null,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    })
    getActiveWhiteboardHelpRequest.mockResolvedValue(null)
    getWhiteboardSessionDetails.mockResolvedValue({
      id: 'board-1',
      name: 'Whiteboard',
      created_by: 'user-1',
      created_at: '2026-03-06T00:00:00.000Z',
      updated_at: '2026-03-06T00:00:00.000Z',
    })
    resolveWhiteboardHelpRequest.mockResolvedValue(undefined)
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

  it('allows entering rename mode from the session header', async () => {
    getWhiteboardSessionDetails.mockResolvedValue({
      id: 'board-1',
      name: 'Whiteboard',
      created_by: 'user-1',
      created_at: '2026-03-06T00:00:00.000Z',
      updated_at: '2026-03-06T00:00:00.000Z',
    })
    listRoomMembers.mockResolvedValue([
      {
        user_id: 'user-1',
        username: 'ron',
        avatar_url: null,
        is_owner: true,
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
      expect(screen.getByRole('button', { name: 'Rename whiteboard' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rename whiteboard' }))

    const input = screen.getByRole('textbox', { name: 'Whiteboard name' })
    fireEvent.change(input, { target: { value: 'Sprint Plan' } })

    expect(screen.getByRole('textbox', { name: 'Whiteboard name' })).toHaveValue('Sprint Plan')
  })

  it('does not persist renames for non-owners', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Rename whiteboard' }))

    const input = screen.getByRole('textbox', { name: 'Whiteboard name' })
    fireEvent.change(input, { target: { value: 'Blocked Rename' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(updateWhiteboardTitle).not.toHaveBeenCalled()
    })

    expect(screen.getByRole('heading', { name: 'Shared Board' })).toBeInTheDocument()
  })

  it('replaces the queue banner with the new session context bar and can move into a live session', async () => {
    render(
      <MemoryRouter initialEntries={["/whiteboards/board-1"]}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('⏳ In Queue')).toBeInTheDocument()
    })

    expect(screen.getByText(/Student submitted 23 minutes ago\s+·\s+Algebra\s+·\s+Grade 9/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick Up Session' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pick Up Session' }))

    expect(screen.getByText('● Live Session')).toBeInTheDocument()
    expect(screen.getByText('Started 4 min ago')).toBeInTheDocument()
    expect(screen.getByText(/🕐 04:23|🕐 04:24/)).toBeInTheDocument()
  })

  it('keeps desktop annotation controls on the canvas when a background photo is present without auto-starting tutor analysis', async () => {
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

    expect(screen.queryByRole('button', { name: /^invite$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /request help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
    expect(screen.getByText('Pen')).toBeInTheDocument()
    expect(screen.getByText('Highlighter')).toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(screen.queryByText(/Hide tutor overlay/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    expect(screen.getByRole('menuitem', { name: /^invite$/i })).toBeInTheDocument()
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
      expect(screen.getByRole('button', { name: 'Open panel' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open panel' }))

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
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change Photo/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show toolbar' }))

    expect(screen.getByText('Pen')).toBeInTheDocument()
    expect(screen.getByText('Highlighter')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))

    expect(screen.getByRole('menuitem', { name: 'Invite' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy board link' })).toBeInTheDocument()
  })

  it('switches from homework to the help tab when the mobile request button is tapped', async () => {
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
      expect(screen.getByRole('button', { name: 'Request help' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Request help' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /See Homework/i })).toBeInTheDocument()
    })

    expect(analyzeWhiteboardPhoto).not.toHaveBeenCalled()
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

  it('routes typed homework text into a mobile help request for students', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Request help' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /See Homework/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Send help request' }))

    await waitFor(() => {
      expect(createWhiteboardHelpRequest).toHaveBeenCalledWith(
        'board-1',
        expect.objectContaining({
          requestText: '',
          problemDraft: 'Solve 5x + 10 = 35',
        }),
      )
    })

    expect(analyzeWhiteboardPhoto).not.toHaveBeenCalled()
    expect(createWhiteboardHelpRequest).not.toHaveBeenCalledWith(
      'board-1',
      expect.objectContaining({
        inputMode: 'text',
        textContent: 'Solve 5x + 10 = 35',
        mode: 'analysis',
      }),
    )
  })

  it('does not show the legacy desktop switch-to-text button', async () => {
    setViewport(1280)

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request help' })).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /Switch to text input/i })).not.toBeInTheDocument()
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

  it('keeps pasted homework text visible while the text field is focused', async () => {
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

    const textarea = screen.getByLabelText('Your Problem')
    fireEvent.focus(textarea)
    fireEvent.paste(textarea)
    fireEvent.change(textarea, {
      target: { value: 'The school store sold 14 notebooks in the morning and 9 in the afternoon. How many notebooks did it sell altogether?' },
    })

    await new Promise((resolve) => window.setTimeout(resolve, 350))

    expect(textarea).not.toHaveClass('text-transparent')

    fireEvent.blur(textarea)

    await waitFor(() => {
      expect(textarea).toHaveClass('text-transparent')
    })
  })

  it('opens help intentionally and lands on the help request tab for students', async () => {
    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request help' })).toBeInTheDocument()
    })

    expect(screen.queryByTestId('right-side-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Request help' }))

    await waitFor(() => {
      expect(screen.getByTestId('right-side-panel')).toBeInTheDocument()
    })

    expect(screen.getByText('Active tab: help-request')).toBeInTheDocument()
    expect(screen.getByText('Panel mode: student')).toBeInTheDocument()
  })

  it('submits a help request instead of running tutor analysis for students', async () => {
    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Request help' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Request help' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start analysis' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'What do you want help with' }), {
      target: { value: 'Help me solve 2x = 10' },
    })

    expect(screen.getByTestId('whiteboard-pad')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send help request' }))

    await waitFor(() => {
      expect(createWhiteboardHelpRequest).toHaveBeenCalledWith(
        'board-1',
        expect.objectContaining({
          requestText: 'Help me solve 2x = 10',
          problemDraft: '',
        }),
      )
    })

    expect(analyzeWhiteboardPhoto).not.toHaveBeenCalled()
    expect(screen.getByText('⏳ In Queue')).toBeInTheDocument()
  })

  it('wires solve and step-by-step help intents into the tutor analysis request', async () => {
    mockAuthState.value = {
      user: { id: 'user-2', app_metadata: { role: 'user', is_tutor: true } },
      profile: { is_tutor: true },
    }

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tutor queue' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open panel' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start analysis' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'What do you want help with' }), {
      target: { value: 'Show me only the next move' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set solve intent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start analysis' }))

    await waitFor(() => {
      expect(analyzeWhiteboardPhoto).toHaveBeenCalledWith(
        'board-1',
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.stringContaining('Please help me solve this without jumping straight to the final answer.'),
            }),
          ],
        }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Set steps intent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start analysis' }))

    await waitFor(() => {
      expect(analyzeWhiteboardPhoto).toHaveBeenLastCalledWith(
        'board-1',
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.stringContaining('Please explain this one step at a time so I can work along on the board.'),
            }),
          ],
        }),
      )
    })
  })

  it('shows tutor assist mode and lets tutors resolve claimed requests', async () => {
    mockAuthState.value = {
      user: { id: 'user-2', app_metadata: { role: 'user', is_tutor: true } },
      profile: { is_tutor: true },
    }
    getActiveWhiteboardHelpRequest.mockResolvedValueOnce({
      id: 'request-claimed',
      boardId: 'board-1',
      requesterUserId: 'user-1',
      requesterUsername: 'ron',
      requestText: 'Please check my work',
      problemDraft: '2x = 10',
      status: 'claimed',
      claimedByUserId: 'user-2',
      claimedByUsername: 'Tutor Kim',
      claimedAt: '2026-03-08T00:10:00.000Z',
      resolvedAt: null,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:10:00.000Z',
    })

    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('● Live Session')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Tutor queue' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request help' })).not.toBeInTheDocument()
    expect(screen.getByText('Started 4 min ago')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open panel' }))

    await waitFor(() => {
      expect(screen.getByText('Panel mode: tutor')).toBeInTheDocument()
    })

    expect(screen.getByText('Active tab: steps')).toBeInTheDocument()
  })

  it('keeps the desktop whiteboard full-width until the optional side panel is opened', async () => {
    render(
      <MemoryRouter initialEntries={['/whiteboards/board-1']}>
        <Routes>
          <Route path="/whiteboards/:boardId" element={<WhiteboardSessionPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open panel' })).toBeInTheDocument()
    })

    expect(screen.queryByTestId('right-side-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open panel' }))

    await waitFor(() => {
      expect(screen.getByTestId('right-side-panel')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Hide panel' })).toBeInTheDocument()
  })
})