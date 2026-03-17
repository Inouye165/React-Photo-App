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
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
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
        <button type="button" onClick={() => setActiveStepId(null)}>
          Exit walkthrough
        </button>
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
  it('defaults Quick Assist to the likely issue region instead of highlighting correct work', () => {
    render(<Harness />)

    expect(screen.queryByTestId('tutor-region-region-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('tutor-region-region-2')).toHaveAttribute('data-active', 'true')
  })

  it('focuses the corresponding overlay region when a step card is clicked', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('article', { name: 'Step 1: Correct' }))

    expect(screen.getByTestId('tutor-region-region-1')).toHaveAttribute('data-active', 'true')
    expect(screen.queryByTestId('tutor-region-region-2')).not.toBeInTheDocument()
  })

  it('returns to the likely issue region after walkthrough exits', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('article', { name: 'Step 1: Correct' }))
    expect(screen.getByTestId('tutor-region-region-1')).toHaveAttribute('data-active', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Exit walkthrough' }))

    expect(screen.queryByTestId('tutor-region-region-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('tutor-region-region-2')).toHaveAttribute('data-active', 'true')
  })

  it('shows the lesson tracker on the whiteboard', () => {
    render(<Harness />)

    expect(screen.getByText('Lesson Tracker')).toBeInTheDocument()
    expect(screen.getByText('Here’s what I notice')).toBeInTheDocument()
    expect(screen.getByText(/Keep the equation balanced on both sides/i)).toBeInTheDocument()
  })

  it('maps region coordinates into the displayed image frame', () => {
    render(
      <div className="relative" style={{ width: 900, height: 600 }}>
        <TutorOverlay
          analysisResult={analysisResult}
          activeStepId="step-1"
          lessonMessage={null}
          boardFrame={{ left: 40, top: 132, width: 700, height: 315 }}
          visible
          reducedMotion
          onToggleVisible={() => undefined}
          onSelectStep={() => undefined}
        />
      </div>,
    )

    expect(screen.getByTestId('tutor-region-region-1')).toHaveStyle({
      left: '70px',
      top: '63px',
      width: '175px',
      height: '37.8px',
    })
  })

  it('does not render placeholder tutor guidance when the active step has no visible content', () => {
    const blankAnalysisResult: TutorAnalysisResult = {
      ...analysisResult,
      steps: [
        {
          id: 'step-blank',
          index: 0,
          studentText: '',
          normalizedMath: '',
          status: 'partial',
          shortLabel: '',
          kidFriendlyExplanation: '',
          regionId: 'region-1',
        },
      ],
      regions: [analysisResult.regions[0]!],
    }

    render(
      <div className="relative" style={{ width: 900, height: 600 }}>
        <TutorOverlay
          analysisResult={blankAnalysisResult}
          activeStepId="step-blank"
          lessonMessage={null}
          boardFrame={{ left: 40, top: 80, width: 700, height: 420 }}
          visible
          reducedMotion
          onToggleVisible={() => undefined}
          onSelectStep={() => undefined}
        />
      </div>,
    )

    expect(screen.queryByText('Tutor Focus')).not.toBeInTheDocument()
  })

  it('does not render placeholder no-region copy when guidance exists without a mapped region', () => {
    const noRegionAnalysisResult: TutorAnalysisResult = {
      ...analysisResult,
      regions: [],
      steps: [
        {
          id: 'step-no-region',
          index: 0,
          studentText: '2x = 8',
          normalizedMath: '2x = 8',
          status: 'partial',
          shortLabel: 'Subtract 3 from both sides',
          kidFriendlyExplanation: 'This move helps isolate the x term.',
          correction: 'Make sure you subtract 3 on both sides.',
        },
      ],
    }

    render(
      <div className="relative" style={{ width: 900, height: 600 }}>
        <TutorOverlay
          analysisResult={noRegionAnalysisResult}
          activeStepId="step-no-region"
          lessonMessage={null}
          boardFrame={{ left: 40, top: 80, width: 700, height: 420 }}
          visible
          reducedMotion
          onToggleVisible={() => undefined}
          onSelectStep={() => undefined}
        />
      </div>,
    )

    expect(screen.getByText('Tutor Focus')).toBeInTheDocument()
    expect(screen.queryByText(/No precise region was detected/i)).not.toBeInTheDocument()
  })
})
