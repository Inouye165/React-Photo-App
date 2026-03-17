import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
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

const sparseAnalysis: WhiteboardTutorResponse = {
  reply: '',
  messages: [{ role: 'assistant', content: '' }],
  analysisResult: {
    problemText: 'Solve for x: 2x = 10',
    finalAnswers: [],
    overallSummary: '',
    regions: [],
    steps: [],
    validatorWarnings: [],
    canAnimate: false,
  },
  sections: {
    problem: 'Solve for x: 2x = 10',
    stepsAnalysis: '',
    errorsFound: '',
    encouragement: '',
  },
  problem: 'Solve for x: 2x = 10',
  correctSolution: '',
  scoreCorrect: 0,
  scoreTotal: 0,
  steps: [],
  errorsFound: [],
  closingEncouragement: '',
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
    window.localStorage.clear()
    resetTutorAssistPersistenceForTests()
  })

  afterEach(() => {
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
          analysisMode={null}
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

  it('renders a compact tutor assist entry before analysis instead of the empty workflow shell', () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: 'Need help with this problem?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByText('Session summary')).not.toBeInTheDocument()
    expect(screen.queryByText('Likely misconception')).not.toBeInTheDocument()
    expect(screen.queryByText('What to say')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pick up session/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^pass$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'CHAT' })).not.toBeInTheDocument()
  })

  it('hides empty workflow sections and untrusted metadata before analysis runs', () => {
    renderPanel()

    expect(screen.queryByText('Queue open')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting now')).not.toBeInTheDocument()
    expect(screen.queryByText('Maya is waiting for live help on this algebra problem.')).not.toBeInTheDocument()
    expect(screen.queryByText('No likely misconception is available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByText('No tutor-ready next move is available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByText('No supporting steps are available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use quick-help response' })).not.toBeInTheDocument()
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
    expect(onRetryAnalysis).toHaveBeenCalledWith('quick')
  })

  it('keeps spoiler content collapsed by default and makes supporting details accessible', () => {
    renderPanel({ analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.queryByText('x = 7')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reveal solution/i }))
    expect(screen.getByText('x = 7')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /evidence from student work/i }))
    expect(screen.getAllByText('5x - 17 = 18').length).toBeGreaterThan(0)
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
    renderPanel({ onMarkStep, analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.getAllByRole('button', { name: 'Focus board here' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Focus board here' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Focus board here' }))

    expect(onMarkStep).toHaveBeenCalledWith(1)
    expect(screen.getByText('Board focus')).toBeInTheDocument()
  })

  it('routes the first response into the conversation detail view', () => {
    renderPanel({ analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: 'Use quick-help response' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }))

    expect(screen.getByRole('textbox', { name: 'Message student' })).toHaveValue(
      'Write +17 on both sides before simplifying. Correct answer: x = 7. What should you add to both sides to cancel the -17?',
    )
  })

  it('opens a focused detail view when requested', () => {
    renderPanel({ analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

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
    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
  })

  it('shows a compact tutor assist entry point and no heavy assist content by default', () => {
    const onStartAnalysis = vi.fn()
    renderPanel({ activeTab: 'ai-tutor', initialTutorAssistState: 'ready', onStartAnalysis, analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('heading', { name: 'Tutor Assist' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByText('Likely issue')).not.toBeInTheDocument()
    expect(screen.queryByText('What to say next')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go deeper' })).not.toBeInTheDocument()
    expect(onStartAnalysis).not.toHaveBeenCalled()
  })

  it('requests quick assist only when the tutor explicitly asks and no analysis is available yet', () => {
    const onStartAnalysis = vi.fn()
    renderPanel({ activeTab: 'ai-tutor', initialTutorAssistState: 'ready', onStartAnalysis, analysis: null, analysisResult: null })

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))

    expect(onStartAnalysis).toHaveBeenCalledTimes(1)
    expect(onStartAnalysis).toHaveBeenCalledWith('quick')
    expect(screen.getByText('Analyzing student work...')).toBeInTheDocument()
  })

  it('requests deeper help only when the tutor explicitly asks and no analysis is available yet', () => {
    const onStartAnalysis = vi.fn()
    renderPanel({ activeTab: 'ai-tutor', initialTutorAssistState: 'ready', onStartAnalysis, analysis: null, analysisResult: null })

    fireEvent.click(screen.getByRole('button', { name: /Full help/i }))

    expect(onStartAnalysis).toHaveBeenCalledTimes(1)
    expect(onStartAnalysis).toHaveBeenCalledWith('full')
    expect(screen.getByText('Analyzing student work...')).toBeInTheDocument()
  })

  it('opens simple assist on request and shows one issue plus one next move', () => {
    const onStartAnalysis = vi.fn()
    renderPanel({ activeTab: 'ai-tutor', initialTutorAssistState: 'ready', onStartAnalysis, analysis: liveAnalysis, analysisMode: 'quick', analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))

    expect(onStartAnalysis).not.toHaveBeenCalled()
    expect(screen.getByText('Keep it short and usable.')).toBeInTheDocument()
    expect(screen.getByText('Likely issue')).toBeInTheDocument()
    expect(screen.getByText('What to say next')).toBeInTheDocument()
    expect(screen.getByText('Board focus')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go deeper' })).toBeInTheDocument()
    expect(screen.queryByText(/Confidence:/i)).not.toBeInTheDocument()
  })

  it('omits missing assist sections instead of showing unavailable cards', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: sparseAnalysis, analysisMode: 'quick', analysisResult: sparseAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))

    expect(screen.queryByText('Likely issue')).not.toBeInTheDocument()
    expect(screen.queryByText('What to say next')).not.toBeInTheDocument()
    expect(screen.queryByText('Board focus')).not.toBeInTheDocument()
    expect(screen.queryByText('No likely issue available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByText('No tutor-ready next move is available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByText('No walkthrough steps are available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Model:/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Confidence:/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go deeper' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this reply' })).not.toBeInTheDocument()
  })

  it('persists tutor private notes across remounts for the same request', () => {
    const firstRender = renderPanel({ activeTab: 'ai-tutor', assistContextKey: 'request-a', analysis: liveAnalysis, analysisMode: 'full', analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: /Full help/i }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Private tutor notes' }), {
      target: { value: 'Check whether Maya is mixing up FOIL and square roots.' },
    })

    expect(screen.getByRole('textbox', { name: 'Private tutor notes' })).toHaveValue('Check whether Maya is mixing up FOIL and square roots.')

    firstRender.unmount()

    renderPanel({ activeTab: 'ai-tutor', assistContextKey: 'request-a', analysis: liveAnalysis, analysisMode: 'full', analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('textbox', { name: 'Private tutor notes' })).toHaveValue('Check whether Maya is mixing up FOIL and square roots.')
  })

  it('does not hydrate tutor notes or deep mode across a different assist context', () => {
    const firstRender = renderPanel({ activeTab: 'ai-tutor', assistContextKey: 'request-a', analysis: liveAnalysis, analysisMode: 'full', analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: /Full help/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Private tutor notes' }), {
      target: { value: 'Only keep this on the first request.' },
    })

    firstRender.unmount()

    renderPanel({ activeTab: 'ai-tutor', assistContextKey: 'request-b', analysis: liveAnalysis, analysisMode: 'full', analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Private tutor notes' })).not.toBeInTheDocument()
    expect(screen.queryByText('Deep Assist')).not.toBeInTheDocument()
  })

  it('shows the tutor assist annotate action in the board move card', () => {
    renderPanel({
      activeTab: 'ai-tutor',
      initialTutorAssistState: 'deep',
      analysis: liveAnalysis,
      analysisResult: liveAnalysis.analysisResult,
      tutorWalkthroughActive: true,
      activeTutorStepId: 'step-1',
    })

    expect(screen.getByRole('button', { name: 'Annotate' })).toBeInTheDocument()
  })

  it('shows board focus feedback when assist starts an annotation action', () => {
    renderPanel({
      activeTab: 'ai-tutor',
      initialTutorAssistState: 'deep',
      analysis: liveAnalysis,
      analysisResult: liveAnalysis.analysisResult,
      tutorWalkthroughActive: true,
      activeTutorStepId: 'step-1',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Annotate' }))

    expect(screen.getByText('Board focus')).toBeInTheDocument()
    expect(screen.getByText('Annotating step 1')).toBeInTheDocument()
    expect(screen.getByText('From Assist')).toBeInTheDocument()
  })

  it('opens deep assist when the tutor explicitly asks for deeper help', () => {
    const onTutorWalkthroughEnter = vi.fn()

    renderPanel({
      activeTab: 'ai-tutor',
      analysis: liveAnalysis,
      analysisMode: 'full',
      analysisResult: liveAnalysis.analysisResult,
      onTutorWalkthroughEnter,
    })

    expect(screen.queryByRole('button', { name: 'Walk me through it' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Full help/i }))

    expect(screen.getByText('Deep Assist')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Walk me through it' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exit walkthrough' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Walk me through it' }))
    expect(onTutorWalkthroughEnter).toHaveBeenCalledTimes(1)
  })

  it('shows one active walkthrough step and lets the tutor exit back to quick assist', () => {
    const onTutorWalkthroughExit = vi.fn()

    renderPanel({
      activeTab: 'ai-tutor',
      initialTutorAssistState: 'deep',
      analysis: liveAnalysis,
      analysisResult: liveAnalysis.analysisResult,
      tutorWalkthroughActive: true,
      activeTutorStepId: 'step-1',
      onTutorWalkthroughExit,
    })

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Undo the minus 17 first so the x term is easier to isolate.')).toBeInTheDocument()
    expect(screen.getAllByText('5x - 17 = 18').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Exit walkthrough' }))
    expect(onTutorWalkthroughExit).toHaveBeenCalledTimes(1)
  })

  it('applies the best coaching move into the response composer from assist detail view', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisMode: 'quick', analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))

    fireEvent.click(screen.getByRole('button', { name: 'Use this reply' }))

    expect(screen.getByRole('tab', { name: 'Response' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: 'Message student' })).toHaveValue('What should you add to both sides to cancel the -17?')
  })

  it('closes assist back to the compact entry state', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisMode: 'quick', analysisResult: liveAnalysis.analysisResult })

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByText('Likely issue')).not.toBeInTheDocument()
  })

  it('renders live diagnosis and assist content from analysis when available', () => {
    renderPanel({ analysis: liveAnalysis, analysisMode: 'quick', analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('heading', { name: 'Write +17 on both sides before simplifying.' })).toBeInTheDocument()
    expect(screen.getAllByText('Add 17 to both sides').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Use quick-help response' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open full steps' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Assist' }))
    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))

    expect(screen.getByText('Keep it short and usable.')).toBeInTheDocument()
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