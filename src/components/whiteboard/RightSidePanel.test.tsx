import type { ComponentProps } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RightSidePanel, { __resetTutorAssistPersistenceForTests } from './RightSidePanel'

describe('RightSidePanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    __resetTutorAssistPersistenceForTests()
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

    expect(screen.getByText('The student is likely treating the square root as a single positive value and missing the second case.')).toBeInTheDocument()
    expect(screen.getByText('Ask')).toBeInTheDocument()
    expect(screen.getByText('Hint')).toBeInTheDocument()
    expect(screen.getByText('Explain')).toBeInTheDocument()
    expect(screen.getByText('Check understanding')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use first response' })).toBeInTheDocument()
  })

  it('keeps spoiler content collapsed by default and makes supporting details accessible', () => {
    renderPanel()

    expect(screen.queryByText('x = 2 or x = -8')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reveal solution/i }))
    expect(screen.getByText('x = 2 or x = -8')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /evidence from student work/i }))
    expect(screen.getByText('Student wrote √(25) = +5 only - missed the negative root')).toBeInTheDocument()
  })

  it('renders a student-specific panel without tutor workflow scaffolding', () => {
    renderPanel({ panelMode: 'student' })

    expect(screen.getByText('Session chat')).toBeInTheDocument()
    expect(screen.getByText('Stay in sync with Maya Chen while you work through the problem.')).toBeInTheDocument()
    expect(screen.queryByText('Tutor workflow')).not.toBeInTheDocument()
    expect(screen.queryByText('Likely issue')).not.toBeInTheDocument()
    expect(screen.queryByText('Best coaching move')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annotate issue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark key step on board' })).not.toBeInTheDocument()
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
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Focus board here' }))

    expect(screen.getByText('Board focus')).toBeInTheDocument()
    expect(screen.getAllByText('Marking step 2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Take the square root of both sides').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Focus board here' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('maps the legacy help-request tab into the assist detail view', () => {
    renderPanel({ activeTab: 'help-request' })

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
    renderPanel({ activeTab: 'ai-tutor', initialTutorAssistState: 'ready', onStartAnalysis })

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
    const firstRender = renderPanel({ activeTab: 'ai-tutor' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Private tutor notes' }), {
      target: { value: 'Check whether Maya is mixing up FOIL and square roots.' },
    })

    firstRender.unmount()

    renderPanel({ activeTab: 'ai-tutor' })

    expect(screen.getByRole('textbox', { name: 'Private tutor notes' })).toHaveValue('Check whether Maya is mixing up FOIL and square roots.')
  })

  it('shows the tutor assist annotate action in the board move card', () => {
    renderPanel({ activeTab: 'ai-tutor' })

    expect(screen.getByRole('button', { name: 'Annotate' })).toBeInTheDocument()
  })

  it('shows board focus feedback when assist starts an annotation action', () => {
    renderPanel({ activeTab: 'ai-tutor' })

    fireEvent.click(screen.getByRole('button', { name: 'Annotate' }))

    expect(screen.getByText('Board focus')).toBeInTheDocument()
    expect(screen.getByText('Annotating step 2')).toBeInTheDocument()
    expect(screen.getByText('From Assist')).toBeInTheDocument()
  })

  it('applies the best coaching move into the response composer from assist detail view', () => {
    renderPanel({ activeTab: 'ai-tutor' })

    fireEvent.click(screen.getByRole('button', { name: 'Use best coaching move' }))

    expect(screen.getByRole('tab', { name: 'Response' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: 'Message student' })).toHaveValue('What other number, besides 5, also squares to 25?')
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