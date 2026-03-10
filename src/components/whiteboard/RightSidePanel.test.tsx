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
    expect(screen.getByText('Diagnosis')).toBeInTheDocument()
    expect(screen.getByText('Response')).toBeInTheDocument()
    expect(screen.getByText('Assist')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'CHAT' })).not.toBeInTheDocument()
  })

  it('shows diagnosis first in the default workflow shell', () => {
    renderPanel()

    expect(screen.getByText('Likely issue')).toBeInTheDocument()
    expect(screen.getByText('Likely issue: Student missed the negative square root at step 2.')).toBeInTheDocument()
    expect(screen.getByText('Key step: Take the square root of both sides')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mark key step on board' }).length).toBeGreaterThan(0)
  })

  it('shows the response section content in the unified shell', () => {
    renderPanel()

    expect(screen.getByText('Recommended next move')).toBeInTheDocument()
    expect(screen.getByText('Guide Maya Chen back to the missing negative root.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use suggested reply' })).toBeInTheDocument()
    expect(screen.getByText('Tutoring moves')).toBeInTheDocument()
    expect(screen.getByText('Encourage progress')).toBeInTheDocument()
    expect(screen.getByText('Ask a guiding question')).toBeInTheDocument()
    expect(screen.getByText('Board action')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mark key step on board' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Annotate issue' })).toBeInTheDocument()
    expect(screen.getByText('Last seen 2 hrs ago')).toBeInTheDocument()
    expect(screen.getByText("I'm not sure what I did wrong on step 3")).toBeInTheDocument()
    expect(screen.getByText('Let me take a look!')).toBeInTheDocument()
    expect(screen.getByText("Student is offline. They'll see your note when they return.")).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message student' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('inserts quick reply chip text into the message input', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /Ask a guiding question/i }))

    expect(screen.getByRole('textbox', { name: 'Message student' })).toHaveValue('What other number, besides 5, also squares to 25?')
  })

  it('shows the empty state when no chat messages exist', () => {
    renderPanel({ initialChatMessages: [] })

    expect(screen.getByText('No messages yet. Start the conversation here.')).toBeInTheDocument()
  })

  it('opens a focused detail view when requested', () => {
    renderPanel()

    fireEvent.click(screen.getAllByRole('button', { name: 'Full view' })[1])

    expect(screen.getByText('Focused detail view')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Response' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Back to workflow' })).toBeInTheDocument()
  })

  it('calls the mark-step handler from the populated steps state', () => {
    const onMarkStep = vi.fn()
    renderPanel({ onMarkStep })

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark key step on board' })[0])

    expect(onMarkStep).toHaveBeenCalledWith(2)
  })

  it('keeps the supporting diagnosis step actions available', () => {
    const onMarkStep = vi.fn()
    renderPanel({ onMarkStep })

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark on board' })[0])

    expect(onMarkStep).toHaveBeenCalledWith(1)
  })

  it('shows persistent board focus feedback after marking a key step', () => {
    renderPanel()

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark key step on board' })[0])

    expect(screen.getByText('Board focus active')).toBeInTheDocument()
    expect(screen.getAllByText('Marking step 2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Take the square root of both sides').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Reply about step 2' }).length).toBeGreaterThan(0)
  })

  it('updates the board focus context when a supporting diagnosis step is marked', () => {
    renderPanel()

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark on board' })[0])

    expect(screen.getAllByText('Marking step 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Add 5 to both sides').length).toBeGreaterThan(0)
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

    expect(screen.getByText('Board focus active')).toBeInTheDocument()
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
    expect(screen.getByText('Online now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss presence notification' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss presence notification' }))

    expect(screen.queryByText('Maya Chen just came online')).not.toBeInTheDocument()
  })
})