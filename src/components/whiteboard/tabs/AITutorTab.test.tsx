import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AITutorTab from './AITutorTab'
import type { WhiteboardTutorResponse } from '../../../types/whiteboard'

const analysis: WhiteboardTutorResponse = {
  reply: 'Solve 2x = 10',
  messages: [{ role: 'assistant', content: 'Solve 2x = 10' }],
  analysisResult: null,
  sections: {
    problem: 'Solve 2x = 10',
    stepsAnalysis: '1. Divide both sides by 2.\n2. Simplify.',
    errorsFound: 'Step 1: Check your division carefully.',
    encouragement: 'Nice start.',
  },
  problem: 'Solve 2x = 10',
  correctSolution: 'x = 5',
  scoreCorrect: 0,
  scoreTotal: 2,
  steps: [
    {
      number: 1,
      label: 'Divide both sides by 2',
      studentWork: '2x / 2 = 10 / 2',
      correct: false,
      neutral: false,
      explanation: 'Divide both sides by 2 so the x term is by itself.',
    },
    {
      number: 2,
      label: 'Simplify both sides',
      studentWork: 'x = 5',
      correct: false,
      neutral: false,
      explanation: 'Simplify each side after dividing.',
    },
  ],
  errorsFound: [
    {
      stepNumber: 1,
      issue: 'You skipped the balancing step.',
      correction: 'divide both sides by 2 before simplifying',
    },
  ],
  closingEncouragement: 'Nice start.',
}

function renderTab(overrides: Partial<React.ComponentProps<typeof AITutorTab>> = {}) {
  const props: React.ComponentProps<typeof AITutorTab> = {
    hasPhoto: false,
    hasInput: true,
    inputMode: 'text',
    problemDraft: 'Solve 2x = 10',
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

describe('AITutorTab guided flow', () => {
  it('shows an immediate lesson response after analysis is available', () => {
    renderTab()

    expect(screen.getByText('Here is the lesson plan')).toBeInTheDocument()
    expect(screen.getByText(/Summary: Nice start\./i)).toBeInTheDocument()
    expect(screen.getByText(/Type your attempt in Student Work/i)).toBeInTheDocument()
  })

  it('mirrors the problem input in text mode', () => {
    const onProblemDraftChange = vi.fn()
    renderTab({ analysis: null, problemDraft: '', onProblemDraftChange, hasInput: false })

    fireEvent.change(screen.getByLabelText('Problem or question'), {
      target: { value: 'What is 3x = 12?' },
    })

    expect(onProblemDraftChange).toHaveBeenCalledWith('What is 3x = 12?')
  })

  it('checks student work before offering the next action', () => {
    renderTab()

    fireEvent.change(screen.getByLabelText('Student work'), {
      target: { value: 'I divided by 2 but got stuck after that.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))

    expect(screen.getByText('Work checked')).toBeInTheDocument()
    expect(screen.getByText('Here’s what I notice')).toBeInTheDocument()
    expect(screen.getByText(/I can see you started with/i)).toBeInTheDocument()
    expect(screen.getByText(/Next action: revisit step 1/i)).toBeInTheDocument()
  })

  it('publishes the latest lesson update when student work is checked', () => {
    const onLessonMessageChange = vi.fn()
    renderTab({ onLessonMessageChange })

    fireEvent.change(screen.getByLabelText('Student work'), {
      target: { value: 'I divided by 2 but got stuck after that.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))

    expect(onLessonMessageChange).toHaveBeenCalled()
    expect(onLessonMessageChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Here’s what I notice',
        tone: 'assistant',
      }),
    )
  })

  it('reveals a hint, then one step at a time, and finally a similar question', () => {
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Give me a hint' }))
    expect(screen.getByText('Hint shown')).toBeInTheDocument()
    expect(screen.getByText('Hint')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show step 1' }))
    expect(screen.getByText('Step 1 shown')).toBeInTheDocument()
    expect(screen.getByText(/Step 1 ready to show on canvas/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show next step' }))
    expect(screen.getByText('Solved')).toBeInTheDocument()
    expect(screen.getByText(/Step 2 ready to show on canvas/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Similar question' }))
    expect(screen.getByText('Similar practice ready')).toBeInTheDocument()
    expect(screen.getByText('Practice Next')).toBeInTheDocument()
    expect(screen.getAllByText(/Solve 3x = 12/i)).toHaveLength(2)
  })
})