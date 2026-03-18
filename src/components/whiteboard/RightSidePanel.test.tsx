import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RightSidePanel from './RightSidePanel'
import { resetTutorAssistPersistenceForTests } from './tutorAssistPersistence'
import type { WhiteboardTutorResponse } from '../../types/whiteboard'

const liveAnalysis: WhiteboardTutorResponse = {
  reply: 'Problem: Solve for x: 5x - 17 = 18',
  messages: [{ role: 'assistant', content: 'Solve for x: 5x - 17 = 18' }],
  analysisSource: 'deterministic',
  analysisPipeline: {
    analysisSource: 'deterministic',
    deterministic: {
      supported: true,
      domain: 'algebra',
      canonicalProblem: '5x - 17 = 18',
      verifiedAnswer: ['x = 7'],
      verifiedSteps: [
        {
          stepIndex: 0,
          expression: '5x - 17 = 18',
          isValid: false,
          explanation: 'Add 17 to both sides before simplifying.',
          errorType: 'equation-transform',
        },
      ],
      detectedError: {
        stepIndex: 0,
        errorType: 'equation-transform',
        explanation: 'The balancing step is missing.',
      },
      confidence: 'high',
    },
    fallback: {
      ran: false,
      source: null,
      type: null,
    },
  },
  mathFacts: {
    supported: true,
    domain: 'algebra',
    canonicalProblem: '5x - 17 = 18',
    verifiedAnswer: ['x = 7'],
    verifiedSteps: [
      {
        stepIndex: 0,
        expression: '5x - 17 = 18',
        isValid: false,
        explanation: 'Add 17 to both sides before simplifying.',
        errorType: 'equation-transform',
      },
    ],
    detectedError: {
      stepIndex: 0,
      errorType: 'equation-transform',
      explanation: 'The balancing step is missing.',
    },
    confidence: 'high',
  },
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
    observedSteps: [
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
    guidedSolutionSteps: [
      {
        id: 'step-1',
        index: 0,
        studentText: '5x - 17 = 18',
        status: 'partial',
        shortLabel: 'Add 17 to both sides',
        kidFriendlyExplanation: 'Undo the minus 17 first so the x term is easier to isolate.',
        correction: 'Write +17 on both sides before simplifying.',
        hint: 'What should you add to both sides to cancel the -17?',
        origin: 'observed',
        observedStepId: 'step-1',
      },
      {
        id: 'step-2',
        index: 1,
        studentText: '5x = 35',
        status: 'correct',
        shortLabel: 'Divide both sides by 5',
        kidFriendlyExplanation: 'Now divide both sides by 5 to get x by itself.',
        origin: 'observed',
        observedStepId: 'step-2',
      },
      {
        id: 'step-3',
        index: 2,
        studentText: 'x = 7',
        normalizedMath: 'x = 7',
        status: 'correct',
        shortLabel: 'Final answer',
        kidFriendlyExplanation: 'This completes the solve.',
        origin: 'final-answer',
      },
    ],
    guidedSolutionMetadata: {
      source: 'mixed-reconstruction',
      isComplete: true,
      reachesFinalAnswers: true,
      synthesizedStepCount: 1,
      hasSynthesizedContinuation: true,
    },
    validatorWarnings: [],
    canAnimate: true,
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

const unsupportedFallbackAnalysis: WhiteboardTutorResponse = {
  ...liveAnalysis,
  analysisSource: 'fallback-llm',
  analysisPipeline: {
    analysisSource: 'fallback-llm',
    deterministic: {
      supported: false,
      domain: 'unknown',
      canonicalProblem: '(x+3)^2-5=20',
      verifiedAnswer: null,
      verifiedSteps: [],
      detectedError: null,
      confidence: 'low',
      unsupportedReason: 'Deterministic math support in this pass is limited to arithmetic and single-variable linear equations.',
    },
    fallback: {
      ran: true,
      source: 'anthropic',
      type: 'llm-evaluation',
      reason: 'Deterministic math support in this pass is limited to arithmetic and single-variable linear equations.',
    },
  },
  mathFacts: {
    supported: false,
    domain: 'unknown',
    canonicalProblem: '(x+3)^2-5=20',
    verifiedAnswer: null,
    verifiedSteps: [],
    detectedError: null,
    confidence: 'low',
    unsupportedReason: 'Deterministic math support in this pass is limited to arithmetic and single-variable linear equations.',
  },
  problem: '(x+3)^2 - 5 = 20',
  correctSolution: 'x = 2 or x = -8',
  analysisResult: {
    problemText: '(x+3)^2 - 5 = 20',
    finalAnswers: ['x = 2', 'x = -8'],
    overallSummary: 'This is a quadratic equation, so the review is AI-generated rather than deterministically verified.',
    regions: [],
    steps: [
      {
        id: 'step-1',
        index: 0,
        studentText: '(x+3)^2 - 5 = 20',
        status: 'partial',
        shortLabel: 'Isolate the squared expression',
        kidFriendlyExplanation: 'Add 5 to both sides first, then take square roots carefully.',
        correction: 'Move the -5 before taking the square root.',
        hint: 'What happens after you add 5 to both sides?',
      },
    ],
    observedSteps: [
      {
        id: 'step-1',
        index: 0,
        studentText: '(x+3)^2 - 5 = 20',
        status: 'partial',
        shortLabel: 'Isolate the squared expression',
        kidFriendlyExplanation: 'Add 5 to both sides first, then take square roots carefully.',
        correction: 'Move the -5 before taking the square root.',
        hint: 'What happens after you add 5 to both sides?',
      },
    ],
    guidedSolutionSteps: [
      {
        id: 'step-1',
        index: 0,
        studentText: '(x+3)^2 - 5 = 20',
        status: 'partial',
        shortLabel: 'Isolate the squared expression',
        kidFriendlyExplanation: 'Add 5 to both sides first, then take square roots carefully.',
        correction: 'Move the -5 before taking the square root.',
        hint: 'What happens after you add 5 to both sides?',
        origin: 'observed',
        observedStepId: 'step-1',
      },
      {
        id: 'step-2',
        index: 1,
        studentText: 'x + 3 = 5',
        normalizedMath: 'x + 3 = 5',
        status: 'correct',
        shortLabel: 'Branch 1',
        kidFriendlyExplanation: 'Solve the positive square-root branch.',
        origin: 'branch',
        branchKey: 'branch-1',
        branchLabel: 'Branch 1',
      },
      {
        id: 'step-3',
        index: 2,
        studentText: 'x = 5 - 3',
        normalizedMath: 'x = 5 - 3',
        status: 'correct',
        shortLabel: 'Isolate x',
        kidFriendlyExplanation: 'Subtract 3 from both sides.',
        origin: 'synthesized',
        branchKey: 'branch-1',
        branchLabel: 'Branch 1',
      },
      {
        id: 'step-4',
        index: 3,
        studentText: 'x = 2',
        normalizedMath: 'x = 2',
        status: 'correct',
        shortLabel: 'Final answer',
        kidFriendlyExplanation: 'This completes the first branch.',
        origin: 'final-answer',
        branchKey: 'branch-1',
        branchLabel: 'Branch 1',
      },
      {
        id: 'step-5',
        index: 4,
        studentText: 'x + 3 = -5',
        normalizedMath: 'x + 3 = -5',
        status: 'correct',
        shortLabel: 'Branch 2',
        kidFriendlyExplanation: 'Solve the negative square-root branch.',
        origin: 'branch',
        branchKey: 'branch-2',
        branchLabel: 'Branch 2',
      },
      {
        id: 'step-6',
        index: 5,
        studentText: 'x = -5 - 3',
        normalizedMath: 'x = -5 - 3',
        status: 'correct',
        shortLabel: 'Isolate x',
        kidFriendlyExplanation: 'Subtract 3 from both sides.',
        origin: 'synthesized',
        branchKey: 'branch-2',
        branchLabel: 'Branch 2',
      },
      {
        id: 'step-7',
        index: 6,
        studentText: 'x = -8',
        normalizedMath: 'x = -8',
        status: 'correct',
        shortLabel: 'Final answer',
        kidFriendlyExplanation: 'This completes the second branch.',
        origin: 'final-answer',
        branchKey: 'branch-2',
        branchLabel: 'Branch 2',
      },
    ],
    guidedSolutionMetadata: {
      source: 'mixed-reconstruction',
      isComplete: true,
      reachesFinalAnswers: true,
      synthesizedStepCount: 6,
      hasSynthesizedContinuation: true,
    },
    validatorWarnings: ['Deterministic math support in this pass is limited to arithmetic and single-variable linear equations.'],
    canAnimate: true,
  },
  sections: {
    problem: '(x+3)^2 - 5 = 20',
    stepsAnalysis: 'Add 5 to both sides, then solve the resulting square-root equation.',
    errorsFound: 'The deterministic checker could not verify this problem type.',
    encouragement: 'Try isolating the square before taking square roots.',
  },
}

const unsupportedOnlyAnalysis: WhiteboardTutorResponse = {
  ...unsupportedFallbackAnalysis,
  analysisResult: {
    problemText: '(x+3)^2 - 5 = 20',
    finalAnswers: [],
    overallSummary: '',
    regions: [],
    steps: [],
    validatorWarnings: ['Deterministic math support in this pass is limited to arithmetic and single-variable linear equations.'],
    canAnimate: false,
  },
  sections: {
    problem: '(x+3)^2 - 5 = 20',
    stepsAnalysis: '',
    errorsFound: '',
    encouragement: '',
  },
  correctSolution: '',
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

  it('shows only Chat and AI Review tabs and defaults to Chat', () => {
    renderPanel()

    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'AI Review' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('tab', { name: 'Diagnosis' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Assist' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message student' })).toBeInTheDocument()
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

  it('shows a concise AI review in the requested order', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    const labels = screen.getAllByText(/Summary|Likely mistake|Student line|Guided next step/).map((element) => element.textContent)
    expect(labels).toEqual(['Summary', 'Likely mistake', 'Student line', 'Guided next step'])
    expect(screen.getByText('x = 7')).toBeInTheDocument()
    expect(screen.getByText('Write +17 on both sides before simplifying.')).toBeInTheDocument()
    expect(screen.getAllByText('Undo the minus 17 first so the x term is easier to isolate.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5x - 17 = 18').length).toBeGreaterThan(0)
  })

  it('renders an honest unsupported state when deterministic review is unavailable', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: unsupportedOnlyAnalysis, analysisResult: unsupportedOnlyAnalysis.analysisResult })

    expect(screen.getByText('Review needs a different pass')).toBeInTheDocument()
    expect(screen.getByText('This problem needs a deeper review before the board walkthrough is ready.')).toBeInTheDocument()
    expect(screen.queryByText('Summary')).not.toBeInTheDocument()
  })

  it('keeps fallback review language user-facing in the default panel', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: unsupportedFallbackAnalysis, analysisResult: unsupportedFallbackAnalysis.analysisResult })

    expect(screen.queryByText('AI-generated review')).not.toBeInTheDocument()
    expect(screen.getByText('This problem needed a deeper review pass. Use the answer and next step below as the teaching guide.')).toBeInTheDocument()
    expect(screen.getByText('x = 2 or x = -8')).toBeInTheDocument()
  })

  it('starts the guided solution overlay from AI Review', () => {
    const onTutorWalkthroughEnter = vi.fn()
    const onToggleTutorOverlay = vi.fn()

    renderPanel({
      activeTab: 'ai-tutor',
      analysis: liveAnalysis,
      analysisResult: liveAnalysis.analysisResult,
      tutorWalkthroughActive: false,
      overlayVisible: false,
      onTutorWalkthroughEnter,
      onToggleTutorOverlay,
    })

    expect(screen.getByText('Guided next step')).toBeInTheDocument()
    expect(screen.getByText('Board markers off')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Next line to show')).toBeInTheDocument()
    expect(screen.getByText('5x = 35')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start walkthrough' }))

    expect(onToggleTutorOverlay).toHaveBeenCalledTimes(1)
    expect(onTutorWalkthroughEnter).toHaveBeenCalledTimes(1)
  })

  it('controls and clears the guided solution overlay from AI Review', () => {
    const onTutorPlaybackPause = vi.fn()
    const onTutorPlaybackPrevious = vi.fn()
    const onTutorPlaybackNext = vi.fn()
    const onTutorWalkthroughExit = vi.fn()
    const onToggleTutorOverlay = vi.fn()

    renderPanel({
      activeTab: 'ai-tutor',
      analysis: liveAnalysis,
      analysisResult: liveAnalysis.analysisResult,
      tutorWalkthroughActive: true,
      tutorPlaybackIsPlaying: true,
      overlayVisible: true,
      activeTutorStepId: 'step-2',
      onTutorPlaybackPause,
      onTutorPlaybackPrevious,
      onTutorPlaybackNext,
      onTutorWalkthroughExit,
      onToggleTutorOverlay,
    })

    expect(screen.getByText('Board markers on')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Current line')).toBeInTheDocument()
    expect(screen.getByText('Playing')).toBeInTheDocument()
    expect(screen.getAllByText('x = 7').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Pause walkthrough' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear walkthrough' }))

    expect(onTutorPlaybackPause).toHaveBeenCalledTimes(1)
    expect(onTutorPlaybackPrevious).toHaveBeenCalledTimes(1)
    expect(onTutorPlaybackNext).toHaveBeenCalledTimes(1)
    expect(onTutorWalkthroughExit).toHaveBeenCalledTimes(1)
    expect(onToggleTutorOverlay).toHaveBeenCalledTimes(1)
  })

  it('starts a review when no analysis is available yet', () => {
    const onStartAnalysis = vi.fn()
    renderPanel({ activeTab: 'ai-tutor', analysis: null, analysisResult: null, onStartAnalysis })

    fireEvent.click(screen.getByRole('button', { name: 'Review work' }))

    expect(onStartAnalysis).toHaveBeenCalledTimes(1)
    expect(onStartAnalysis).toHaveBeenCalledWith('quick')
  })

  it('clears the current AI review only after confirmation', () => {
    const onClearAnalysisReview = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult, onClearAnalysisReview })

    fireEvent.click(screen.getByRole('button', { name: 'Clear AI review' }))

    expect(confirmSpy).toHaveBeenCalledWith('Clear this AI review?')
    expect(onClearAnalysisReview).toHaveBeenCalledTimes(1)
  })

  it('keeps engine response details behind a development-only disclosure', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    })

    renderPanel({ activeTab: 'ai-tutor', analysis: unsupportedFallbackAnalysis, analysisResult: unsupportedFallbackAnalysis.analysisResult })

  fireEvent.click(screen.getByText('Technical details'))
  fireEvent.click(screen.getByRole('button', { name: 'View details' }))

  expect(screen.getByText('Engine response')).toBeInTheDocument()
    expect(screen.getByText(/"observedSteps"/)).toBeInTheDocument()
    expect(screen.getByText(/"guidedSolutionSteps"/)).toBeInTheDocument()
    expect(screen.getByText(/"deterministicResponse"/)).toBeInTheDocument()
    expect(screen.getByText(/"fallbackRan": true/)).toBeInTheDocument()
    expect(screen.getByText(/"fallbackSource": "anthropic"/)).toBeInTheDocument()
    expect(screen.getByText(/"analysisSource": "fallback-llm"/)).toBeInTheDocument()
    expect(screen.getByText(/"guidedSolutionSource": "mixed-reconstruction"/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))

    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it('does not clear the current AI review when confirmation is cancelled', () => {
    const onClearAnalysisReview = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel({ activeTab: 'ai-tutor', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult, onClearAnalysisReview })

    fireEvent.click(screen.getByRole('button', { name: 'Clear AI review' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(onClearAnalysisReview).not.toHaveBeenCalled()
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

  it('maps the legacy help-request tab into the assist detail view', () => {
    renderPanel({ activeTab: 'help-request', analysis: liveAnalysis, analysisResult: liveAnalysis.analysisResult })

    expect(screen.getByRole('tab', { name: 'AI Review' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Summary')).toBeInTheDocument()
  })

  it('shows the review entry state when analysis is sparse', () => {
    renderPanel({ activeTab: 'ai-tutor', analysis: sparseAnalysis, analysisMode: 'quick', analysisResult: sparseAnalysis.analysisResult })

    expect(screen.getByRole('button', { name: 'Review work' })).toBeInTheDocument()
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument()
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