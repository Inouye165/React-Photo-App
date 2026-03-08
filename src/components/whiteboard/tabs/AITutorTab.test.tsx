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

function renderTab(overrides: Partial<React.ComponentProps<typeof AITutorTab>> = {}) {
  const props: React.ComponentProps<typeof AITutorTab> = {
    hasPhoto: false,
    hasInput: true,
    inputMode: 'text',
    problemDraft: 'Solve for x: 5x - 17 = 18',
    onProblemDraftChange: vi.fn(),
    analysis,
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
  it('shows a single AI help action before analysis', () => {
    const onStartAnalysis = vi.fn()

    renderTab({
      analysis: null,
      hasInput: false,
      hasPhoto: true,
      inputMode: 'photo',
      problemDraft: '',
      onStartAnalysis,
    })

    expect(screen.getByText('Request AI help when you want a clean read of the problem, the steps, and the solution.')).toBeInTheDocument()
    expect(screen.getByText('Problem')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get AI help' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Get AI help' }))
    expect(onStartAnalysis).toHaveBeenCalled()
  })

  it('lets the tutor minimally edit the problem text', () => {
    const onProblemDraftChange = vi.fn()
    renderTab({ analysis: null, hasInput: true, problemDraft: 'Solve for x: 5x - 17 = 18', onProblemDraftChange })

    fireEvent.click(screen.getByRole('button', { name: 'Edit problem' }))
    fireEvent.change(screen.getByLabelText('Problem or question'), {
      target: { value: 'Solve for x: 5x - 17 = 23' },
    })

    expect(onProblemDraftChange).toHaveBeenCalledWith('Solve for x: 5x - 17 = 23')
  })

  it('shows the problem, steps, and solution after AI help runs', () => {
    renderTab()

    expect(screen.getByText('This is the problem as the AI understands it.')).toBeInTheDocument()
    expect(screen.getByText('Solve for x: 5x - 17 = 18')).toBeInTheDocument()
    expect(screen.getByText('Steps')).toBeInTheDocument()
    expect(screen.getByText('1. Add 17 to both sides')).toBeInTheDocument()
    expect(screen.getByText('2. Divide both sides by 5')).toBeInTheDocument()
    expect(screen.getByText('Solution')).toBeInTheDocument()
    expect(screen.getByText('x = 7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh AI help' })).toBeInTheDocument()
  })

  it('publishes a single primary lesson insight for the whiteboard overlay', () => {
    const onLessonMessageChange = vi.fn()
    renderTab({ onLessonMessageChange })

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

    expect(screen.getByText('AI help failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetryAnalysis).toHaveBeenCalled()
  })
})
