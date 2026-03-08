import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TutorOverlay from './TutorOverlay'
import StepsTab from './tabs/StepsTab'
import type { TutorAnalysisResult } from '../../types/whiteboard'

const analysisResult: TutorAnalysisResult = {
  problemText: 'Solve 2x + 3 = 11',
  finalAnswers: ['x = 4'],
  overallSummary: 'You are on the right track.',
  regions: [
    { id: 'region-1', x: 0.1, y: 0.2, width: 0.25, height: 0.12 },
    { id: 'region-2', x: 0.1, y: 0.38, width: 0.25, height: 0.12 },
  ],
  steps: [
    {
      id: 'step-1',
      index: 0,
      studentText: '2x + 3 = 11',
      normalizedMath: '2x + 3 = 11',
      status: 'correct',
      shortLabel: 'Start with the equation',
      kidFriendlyExplanation: 'You wrote the problem clearly.',
      regionId: 'region-1',
    },
    {
      id: 'step-2',
      index: 1,
      studentText: '2x = 8',
      normalizedMath: '2x = 8',
      status: 'partial',
      shortLabel: 'Subtract 3 from both sides',
      kidFriendlyExplanation: 'This move helps isolate the x term.',
      correction: 'Make sure you subtract 3 on both sides.',
      regionId: 'region-2',
    },
  ],
  validatorWarnings: [],
  canAnimate: true,
}

function Harness() {
  const [activeStepId, setActiveStepId] = useState<string | null>('step-1')
  return (
    <div className="relative" style={{ width: 900, height: 600 }}>
      <TutorOverlay
        analysisResult={analysisResult}
        activeStepId={activeStepId}
        lessonMessage={{
          title: 'Here’s what I notice',
          body: 'You started correctly. Keep the equation balanced on both sides.',
          tone: 'assistant',
        }}
        boardFrame={{ left: 40, top: 80, width: 700, height: 420 }}
        visible
        reducedMotion
        onToggleVisible={() => undefined}
        onSelectStep={setActiveStepId}
      />
      <div style={{ marginTop: 520 }}>
        <StepsTab
          hasPhoto
          isLoading={false}
          analysisResult={analysisResult}
          steps={[]}
          activeStepId={activeStepId}
          onStepSelect={setActiveStepId}
          overlayVisible
        />
      </div>
    </div>
  )
}

describe('Tutor overlay integration', () => {
  it('focuses the corresponding overlay region when a step card is clicked', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('article', { name: 'Step 2: Partial' }))

    expect(screen.getByTestId('tutor-region-region-1')).toHaveAttribute('data-active', 'false')
    expect(screen.getByTestId('tutor-region-region-2')).toHaveAttribute('data-active', 'true')
  })

  it('shows the lesson tracker on the whiteboard', () => {
    render(<Harness />)

    expect(screen.getByText('Lesson Tracker')).toBeInTheDocument()
    expect(screen.getByText('Here’s what I notice')).toBeInTheDocument()
    expect(screen.getByText(/Keep the equation balanced on both sides/i)).toBeInTheDocument()
  })
})
