import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AITutorTab from './AITutorTab'
import type { WhiteboardTutorResponse } from '../../../types/whiteboard'

const analysis: WhiteboardTutorResponse = {
  reply: 'Solve 5x - 17 = 18',
  messages: [{ role: 'assistant', content: 'Solve 5x - 17 = 18' }],
  analysisResult: {
    problemText: 'Solve for x: 5x - 17 = 18',
    finalAnswers: ['x = 7'],
    overallSummary: 'Add 17 to both sides, then divide both sides by 5.',
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
        hint: 'Try turning 5x - 17 = 18 into 5x = 35.',
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
    canAnimate: true,
  },
  sections: {
    problem: 'Solve for x: 5x - 17 = 18',
    stepsAnalysis: '1. Add 17 to both sides.\n2. Divide both sides by 5.',
    errorsFound: 'Step 1: The balancing move needs to be shown.',
    encouragement: 'Nice start.',
  },
  problem: 'Solve for x: 5x - 17 = 18',
  correctSolution: 'x = 7',
  scoreCorrect: 0,
  scoreTotal: 2,
  steps: [
    {
      number: 1,
      label: 'Add 17 to both sides',
      studentWork: '5x = 35',
      correct: false,
      neutral: false,
      explanation: 'Undo the subtraction before dividing.',
    },
    {
      number: 2,
      label: 'Divide both sides by 5',
      studentWork: 'x = 7',
      correct: true,
      neutral: false,
      explanation: 'Now isolate x.',
    },
  ],
  errorsFound: [
    {
      stepNumber: 1,
      issue: 'You skipped showing the balancing step.',
      correction: 'add 17 to both sides before simplifying',
    },
  ],
  closingEncouragement: 'Nice start.',
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

function renderTab(overrides: Partial<React.ComponentProps<typeof AITutorTab>> = {}) {
  const props: React.ComponentProps<typeof AITutorTab> = {
    hasPhoto: false,
    hasInput: true,
    inputMode: 'text',
    problemDraft: 'Solve for x: 5x - 17 = 18',
    onProblemDraftChange: vi.fn(),
    analysis,
    analysisMode: 'quick',
    isLoading: false,
    error: null,
    onStartAnalysis: vi.fn(),
    onRetryAnalysis: vi.fn(),
    responseAge: '',
    responseAgeInvalid: false,
    onResponseAgeChange: vi.fn(),
    followUpDraft: '',
    isSubmitting: false,
    onFollowUpDraftChange: vi.fn(),
    onSubmitFollowUp: vi.fn(),
    ...overrides,
  }

  return render(<AITutorTab {...props} />)
}

describe('AITutorTab minimalist tutor assist', () => {
  it('shows a compact assist entry point before analysis', () => {
    const onStartAnalysis = vi.fn()

    renderTab({
      analysis: null,
      hasInput: false,
      hasPhoto: true,
      inputMode: 'photo',
      problemDraft: '',
      onStartAnalysis,
    })

    expect(screen.getByText('Need help with this problem?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByText('Problem')).not.toBeInTheDocument()
    expect(screen.queryByText('Diagnosis')).not.toBeInTheDocument()
    expect(screen.queryByText('What to say')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))
    expect(onStartAnalysis).toHaveBeenCalledWith('quick')
  })

  it('shows only the two help modes before analysis and hides filler copy', () => {
    const onStartAnalysis = vi.fn()

    renderTab({ analysis: null, hasPhoto: true, hasInput: false, inputMode: 'photo', problemDraft: '', onStartAnalysis })

    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByText('No likely issue is available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByText('No tutor-ready next move is available from this analysis.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Full help/i }))
    expect(onStartAnalysis).toHaveBeenCalledWith('full')
  })

  it('keeps heavy assist content hidden by default even when analysis already exists', () => {
    renderTab()

    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByText('Diagnosis')).not.toBeInTheDocument()
    expect(screen.queryByText('What to say')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Switch to full help' })).not.toBeInTheDocument()
  })

  it('lets the tutor minimally edit the problem text', () => {
    const onProblemDraftChange = vi.fn()
    renderTab({ analysis: null, hasInput: true, problemDraft: 'Solve for x: 5x - 17 = 18', onProblemDraftChange })

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit problem' }))
    fireEvent.change(screen.getByLabelText('Problem or question'), {
      target: { value: 'Solve for x: 5x - 17 = 23' },
    })

    expect(onProblemDraftChange).toHaveBeenCalledWith('Solve for x: 5x - 17 = 23')
  })

  it('opens quick help on request and shows diagnosis plus one next move', () => {
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))

    expect(screen.getByText('Mistake first. Correct answer next. One short line to say.')).toBeInTheDocument()
    expect(screen.getByText('Diagnosis')).toBeInTheDocument()
    expect(screen.getByText('Write +17 on both sides before simplifying.')).toBeInTheDocument()
    expect(screen.getByText('What to say')).toBeInTheDocument()
    expect(screen.getByText('Try turning 5x - 17 = 18 into 5x = 35.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use this reply in chat' })).toBeInTheDocument()
    expect(screen.getByText('Board focus')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to full help' })).toBeInTheDocument()
    expect(screen.queryByText(/Confidence:/i)).not.toBeInTheDocument()
  })

  it('opens full help directly when requested', () => {
    const onEnterWalkthrough = vi.fn()

    renderTab({ onEnterWalkthrough, analysisMode: 'full' })

    fireEvent.click(screen.getByRole('button', { name: /Full help/i }))

    expect(screen.getByRole('heading', { name: 'Full help' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Walk me through it' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Walk me through it' }))
    expect(onEnterWalkthrough).toHaveBeenCalledTimes(1)
  })

  it('shows the current walkthrough step only after walkthrough is explicitly active in full help', () => {
    const onExitWalkthrough = vi.fn()

    renderTab({
      analysis,
      analysisMode: 'full',
      walkthroughActive: true,
      activeWalkthroughStepId: 'step-1',
      canWalkthroughPlay: true,
      isWalkthroughPlaying: false,
      onExitWalkthrough,
      onWalkthroughPrevious: vi.fn(),
      onWalkthroughNext: vi.fn(),
      onWalkthroughPlay: vi.fn(),
      onWalkthroughPause: vi.fn(),
      onWalkthroughReplay: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: /Full help/i }))

    expect(screen.getByText('Step 1. Add 17 to both sides')).toBeInTheDocument()
    expect(screen.getAllByText('5x - 17 = 18').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Exit walkthrough' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Exit walkthrough' }))
    expect(onExitWalkthrough).toHaveBeenCalledTimes(1)
  })

  it('lets the tutor start walkthrough from a preview step', () => {
    const onEnterWalkthrough = vi.fn()
    const onWalkthroughSelectStep = vi.fn()

    renderTab({
      analysisMode: 'full',
      onEnterWalkthrough,
      onWalkthroughSelectStep,
    })

    fireEvent.click(screen.getByRole('button', { name: /Full help/i }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Start here' })[0])

    expect(onEnterWalkthrough).toHaveBeenCalledTimes(1)
    expect(onWalkthroughSelectStep).toHaveBeenCalledWith('step-1')
  })

  it('does not publish lesson insight until assist is explicitly opened', () => {
    const onLessonMessageChange = vi.fn()
    renderTab({ onLessonMessageChange })

    expect(onLessonMessageChange).toHaveBeenCalledWith(null)

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))

    expect(onLessonMessageChange).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Add 17 to both sides',
        tone: 'assistant',
      }),
    )
  })

  it('shows a retry state when AI help fails', () => {
    const onRetryAnalysis = vi.fn()
    renderTab({ analysis: null, error: 'Unable to read the problem.', onRetryAnalysis })

    expect(screen.getByText('Assist request failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetryAnalysis).toHaveBeenCalledWith('quick')
  })

  it('omits missing assist sections instead of showing unavailable mobile content', () => {
    renderTab({ analysis: sparseAnalysis })

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))

    expect(screen.queryByText('Diagnosis')).not.toBeInTheDocument()
    expect(screen.queryByText('What to say')).not.toBeInTheDocument()
    expect(screen.queryByText('Board focus')).not.toBeInTheDocument()
    expect(screen.queryByText('No likely issue is available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByText('No tutor-ready next move is available from this analysis.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Model:/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Confidence:/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Switch to full help' })).not.toBeInTheDocument()
  })

  it('closes assist back to the compact entry state', () => {
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByText('Diagnosis')).not.toBeInTheDocument()
  })

  it('resets back to the compact state when the assist request context changes', () => {
    const { rerender } = renderTab({ assistContextKey: 'request-a' })

    fireEvent.click(screen.getByRole('button', { name: /Quick help/i }))
    expect(screen.getByText('Diagnosis')).toBeInTheDocument()

    rerender(
      <AITutorTab
        hasPhoto={false}
        hasInput
        inputMode="text"
        problemDraft="Solve for x: 8x = 40"
        onProblemDraftChange={vi.fn()}
        analysis={analysis}
        analysisMode="quick"
        isLoading={false}
        error={null}
        onStartAnalysis={vi.fn()}
        onRetryAnalysis={vi.fn()}
        responseAge=""
        responseAgeInvalid={false}
        onResponseAgeChange={vi.fn()}
        followUpDraft=""
        isSubmitting={false}
        onFollowUpDraftChange={vi.fn()}
        onSubmitFollowUp={vi.fn()}
        assistContextKey="request-b"
      />,
    )

    expect(screen.getByRole('button', { name: /Quick help/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Full help/i })).toBeInTheDocument()
    expect(screen.queryByText('Diagnosis')).not.toBeInTheDocument()
  })
})
