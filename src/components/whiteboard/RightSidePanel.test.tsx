import type { ComponentProps } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RightSidePanel from './RightSidePanel'
import { resetTutorAssistPersistenceForTests } from './tutorAssistPersistence'
import type { WhiteboardTutorResponse } from '../../types/whiteboard'

const liveAnalysis: WhiteboardTutorResponse = {
  reply: 'Problem: Solve for x: 5x - 17 = 18',
  messages: [{ role: 'assistant', content: 'Solve for x: 5x - 17 = 18' }],
  analysisResult: {
    problemText: 'Solve for x: 5x - 17 = 18',
    finalAnswers: ['x = 7'],
    overallSummary: 'Nice start. You are close.',
    regions: [],
    steps: [
      {
        id: 'step-1',
        index: 0,
        studentText: '5x - 17 = 18',
        status: 'partial',
        shortLabel: 'Add 17 to both sides',
        kidFriendlyExplanation: 'Undo the minus 17 first so the x term is easier to isolate.',
        correction: 'Write +17 on both sides before simplifying.',
        hint: 'What should you add to both sides to cancel the -17?',
      },
      {
        id: 'step-2',
        index: 1,
        studentText: '5x = 35',
        status: 'correct',
        shortLabel: 'Divide both sides by 5',
        kidFriendlyExplanation: 'Now divide both sides by 5 to get x by itself.',
      },
    ],
    validatorWarnings: [],
    canAnimate: false,
  },
  sections: {
    problem: 'Solve for x: 5x - 17 = 18',
    stepsAnalysis: '1. Add 17 to both sides.\n2. Divide both sides by 5.',
    errorsFound: 'Step 1: Show the balancing move.',
    encouragement: 'Nice start. You are close.',
  },
  problem: 'Solve for x: 5x - 17 = 18',
  correctSolution: 'x = 7',
  scoreCorrect: 1,
  scoreTotal: 2,
  steps: [],
  errorsFound: [],
  closingEncouragement: 'Nice start. You are close.',
}

const chatFixture = [
  {
    id: 'student-1',
    sender: 'student' as const,
    body: "I'm not sure what I did wrong on step 3",
    timestamp: '35 min ago',
    unread: true,
  },
  {
    id: 'tutor-1',
    sender: 'tutor' as const,
    body: 'Let me take a look!',
    timestamp: '10 min ago',
  },
]

describe('RightSidePanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    resetTutorAssistPersistenceForTests()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  function renderPanel(overrides: Partial<ComponentProps<typeof RightSidePanel>> = {}) {
    return render(
      <div style={{ height: '640px' }}>
        <RightSidePanel
          studentName="Maya Chen"
          initialChatMessages={chatFixture}
          hasPhoto={false}
          analysis={null}
          analysisLoading={false}
          analysisError={null}
          sessionState="queued"
          sessionBadgeText="Queue open"
          sessionSummaryText="Maya is waiting for live help on this algebra problem."
          sessionMetaText="Waiting now"
          onPickUpSession={vi.fn()}
          onPassSession={vi.fn()}
          analysisPendingConfirmation={false}
          onStartAnalysis={vi.fn()}
          onRetryAnalysis={vi.fn()}
          responseAge=""
          responseAgeInvalid={false}
          onResponseAgeChange={vi.fn()}
          tutorDraft=""
          tutorSubmitting={false}
          onTutorDraftChange={vi.fn()}
          onTutorSubmit={vi.fn()}
          onRequestHumanTutor={vi.fn()}
          {...overrides}
        />
      </div>,
    )
  }

  it('renders the workflow shell sections instead of peer tabs', () => {
    renderPanel()

    expect(screen.getByText('Tutor workflow')).toBeInTheDocument()
    expect(screen.getByText('Session summary')).toBeInTheDocument()
    expect(screen.getByText('Likely misconception')).toBeInTheDocument()
    expect(screen.getByText('What to say next')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pick up session/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^pass$/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'CHAT' })).not.toBeInTheDocument()
  })

  it('shows the misconception and next-move hierarchy in the default workflow shell', () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: 'The student is likely treating the square root as a single positive value and missing the second case.' })).toBeInTheDocument()
    expect(screen.getByText('Ask')).toBeInTheDocument()
    expect(screen.getByText('Hint')).toBeInTheDocument()
    expect(screen.getByText('Explain')).toBeInTheDocument()
    expect(screen.getByText('Check understanding')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use first response' })).toBeInTheDocument()
  })

  it('shows visible analysis status for confirmation, loading, and errors', () => {
    const onRetryAnalysis = vi.fn()
    const { rerender } = renderPanel({ analysisPendingConfirmation: true })

    expect(screen.getByText('Confirm AI assistance to start analysis.')).toBeInTheDocument()

    rerender(
      <div style={{ height: '640px' }}>
        <RightSidePanel
          studentName="Maya Chen"
          initialChatMessages={chatFixture}
          hasPhoto={false}
          analysis={null}
          analysisLoading
          analysisError={null}
          analysisPendingConfirmation={false}
          sessionState="queued"
          sessionBadgeText="Queue open"
          sessionSummaryText="Maya is waiting for live help on this algebra problem."
          sessionMetaText="Waiting now"
          onPickUpSession={vi.fn()}
          onPassSession={vi.fn()}
          onStartAnalysis={vi.fn()}
          onRetryAnalysis={onRetryAnalysis}
          responseAge=""
          responseAgeInvalid={false}
          onResponseAgeChange={vi.fn()}
          tutorDraft=""
          tutorSubmitting={false}
          onTutorDraftChange={vi.fn()}
          onTutorSubmit={vi.fn()}
          onRequestHumanTutor={vi.fn()}
        />
      </div>,
    )

    expect(screen.getByText('Analyzing the current board…')).toBeInTheDocument()

    rerender(
      <div style={{ height: '640px' }}>
        <RightSidePanel
          studentName="Maya Chen"
          initialChatMessages={chatFixture}
          hasPhoto={false}
          analysis={null}
          analysisLoading={false}
          analysisError="Server returned an invalid tutor payload."
          analysisPendingConfirmation={false}
          sessionState="queued"
          sessionBadgeText="Queue open"
          sessionSummaryText="Maya is waiting for live help on this algebra problem."
          sessionMetaText="Waiting now"
          onPickUpSession={vi.fn()}
          onPassSession={vi.fn()}
          onStartAnalysis={vi.fn()}
          onRetryAnalysis={onRetryAnalysis}
          responseAge=""
          responseAgeInvalid={false}
          onResponseAgeChange={vi.fn()}
          tutorDraft=""
          tutorSubmitting={false}
          onTutorDraftChange={vi.fn()}
          onTutorSubmit={vi.fn()}
          onRequestHumanTutor={vi.fn()}
        />
      </div>,
    )

    expect(screen.getByText('Could not analyze this board.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry AI' }))
    expect(onRetryAnalysis).toHaveBeenCalledTimes(1)
  })

  it('keeps spoiler content collapsed by default and makes supporting details accessible', () => {
    renderPanel()

    expect(screen.queryByText('x = 2 or x = -8')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reveal solution/i }))
    expect(screen.getByText('x = 2 or x = -8')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /evidence from student work/i }))
    expect(screen.getAllByText('Student wrote √(25) = +5 only - missed the negative root').length).toBeGreaterThan(0)
  })

  it('renders a student-specific panel without tutor workflow scaffolding', () => {
    renderPanel({ panelMode: 'student' })

    expect(screen.getByText('Session chat')).toBeInTheDocument()
    expect(screen.getByText('Stay in sync with Maya Chen while you work through the problem.')).toBeInTheDocument()
    expect(screen.queryByText('Tutor workflow')).not.toBeInTheDocument()
    expect(screen.queryByText('Likely issue')).not.toBeInTheDocument()
    expect(screen.queryByText('Best coaching move')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annotate issue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark blocking step on board' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message your tutor' })).toBeInTheDocument()
  })

  it('keeps only one primary board-focus action in the main surface and uses it', () => {
    const onMarkStep = vi.fn()
    renderPanel({ onMarkStep })

    expect(screen.getAllByRole('button', { name: 'Focus board here' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Focus board here' }))

    expect(onMarkStep).toHaveBeenCalledWith(2)
    expect(screen.getByText('Board focus')).toBeInTheDocument()
    expect(screen.getAllByText('Marking step 2').length).toBeGreaterThan(0)
  })

  it('routes the first response into the conversation detail view', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Use first response' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }))

    expect(screen.getByRole('textbox', { name: 'Message student' })).toHaveValue('What two numbers square to 25?')
  })

  it('opens a focused detail view when requested', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Open full steps' }))

    expect(screen.getByText('Workflow detail')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Diagnosis' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Back to workflow' })).toBeInTheDocument()
  })

  it('shows persistent board focus feedback after marking a key step', () => {
    renderPanel({ analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: 'Focus board here' }))

    expect(screen.getByText('Board focus')).toBeInTheDocument()
    expect(screen.getAllByText('Marking step 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Add 17 to both sides').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Focus board here' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('maps the legacy help-request tab into the assist detail view', () => {
    renderPanel({ activeTab: 'help-request', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('tab', { name: 'Assist' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Best coaching move')).toBeInTheDocument()
  })

  it('shows the tutor assist ready state without auto-running analysis', () => {
    const onStartAnalysis = vi.fn()
    renderPanel({ activeTab: 'ai-tutor', initialTutorAssistState: 'ready', onStartAnalysis })

    expect(screen.getByRole('heading', { name: 'Tutor Assist' })).toBeInTheDocument()
    expect(screen.getByText('AI analysis · only runs when you click')).toBeInTheDocument()
    expect(onStartAnalysis).not.toHaveBeenCalled()
  })

  it('runs tutor assist analysis only when requested and transitions through loading to populated', () => {
    const onStartAnalysis = vi.fn()
    renderPanel({
      activeTab: 'ai-tutor',
      initialTutorAssistState: 'ready',
      onStartAnalysis,
      analysis: liveAnalysis,
      analysisResult: liveAnalysis.analysisResult,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Analyze Student Work' }))

    expect(onStartAnalysis).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Analyzing student work...')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByText('Best coaching move')).toBeInTheDocument()
    expect(screen.getByText('Best annotate-on-board move')).toBeInTheDocument()
    expect(screen.getByText('Best fallback explanation')).toBeInTheDocument()
    expect(screen.getByText('Confidence phrase')).toBeInTheDocument()
  })

  it('persists tutor private notes across remounts', () => {
    const firstRender = renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    fireEvent.change(screen.getByRole('textbox', { name: 'Private tutor notes' }), {
      target: { value: 'Check whether Maya is mixing up FOIL and square roots.' },
    })

    firstRender.unmount()

    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('textbox', { name: 'Private tutor notes' })).toHaveValue('Check whether Maya is mixing up FOIL and square roots.')
  })

  it('shows the tutor assist annotate action in the board move card', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('button', { name: 'Annotate' })).toBeInTheDocument()
  })

  it('shows board focus feedback when assist starts an annotation action', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: 'Annotate' }))

    expect(screen.getByText('Board focus')).toBeInTheDocument()
    expect(screen.getByText('Annotating step 1')).toBeInTheDocument()
    expect(screen.getByText('From Assist')).toBeInTheDocument()
  })

  it('applies the best coaching move into the response composer from assist detail view', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: 'Use best coaching move' }))

    expect(screen.getByRole('tab', { name: 'Response' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: 'Message student' })).toHaveValue('What should you add to both sides to cancel the -17?')
  })

  it('renders live diagnosis and assist content from analysis when available', () => {
    renderPanel({ analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('heading', { name: 'Write +17 on both sides before simplifying.' })).toBeInTheDocument()
    expect(screen.getAllByText('Add 17 to both sides').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Use first response' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open assist detail' }))

    expect(screen.getByText('Best coaching move')).toBeInTheDocument()
    expect(screen.getByText('What should you add to both sides to cancel the -17?')).toBeInTheDocument()
  })

  it('uses a safe generic student label in the recommended next move copy', () => {
    renderPanel({ studentName: 'Test', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.queryByText(/Guide Test back to/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Guide Test to fix step 1\./i)).not.toBeInTheDocument()
  })

  it('shows an online toast when the student comes online and allows manual dismissal', () => {
    const { rerender } = renderPanel({ studentPresence: 'offline' })

    rerender(
      <div style={{ height: '640px' }}>
        <RightSidePanel
          studentName="Maya Chen"
          studentPresence="online"
          hasPhoto={false}
          analysis={null}
          analysisLoading={false}
          analysisError={null}
          onStartAnalysis={vi.fn()}
          onRetryAnalysis={vi.fn()}
          responseAge=""
          responseAgeInvalid={false}
          onResponseAgeChange={vi.fn()}
          tutorDraft=""
          tutorSubmitting={false}
          onTutorDraftChange={vi.fn()}
          onTutorSubmit={vi.fn()}
          onRequestHumanTutor={vi.fn()}
        />
      </div>,
    )

    expect(screen.getByText('Maya Chen just came online')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss presence notification' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss presence notification' }))

    expect(screen.queryByText('Maya Chen just came online')).not.toBeInTheDocument()
  })
})