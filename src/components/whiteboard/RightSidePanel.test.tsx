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

  it('renders the requested three tabs', () => {
    renderPanel()

    expect(screen.getByRole('tab', { name: 'CHAT' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'STEPS' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'TUTOR ASSIST' })).toBeInTheDocument()
  })

  it('shows the redesigned chat thread by default', () => {
    renderPanel()

    expect(screen.getAllByText('Maya Chen')).toHaveLength(2)
    expect(screen.getByText('Last seen 2 hrs ago')).toBeInTheDocument()
    expect(screen.getByText("I'm not sure what I did wrong on step 3")).toBeInTheDocument()
    expect(screen.getByText('Let me take a look!')).toBeInTheDocument()
    expect(screen.getByText("Student is offline - they'll see your message when they return")).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message student' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('inserts quick reply chip text into the message input', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Check step 2' }))

    expect(screen.getByRole('textbox', { name: 'Message student' })).toHaveValue('Check step 2')
  })

  it('shows the empty state when no chat messages exist', () => {
    renderPanel({ initialChatMessages: [] })

    expect(screen.getByRole('heading', { name: 'No messages yet' })).toBeInTheDocument()
    expect(screen.getByText('Start the conversation below')).toBeInTheDocument()
  })

  it('shows the populated steps state by default when the steps tab is opened', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('tab', { name: 'STEPS' }))
    expect(screen.getByText('PROBLEM')).toBeInTheDocument()
    expect(screen.getByText('(x + 3)^2 - 5 = 20')).toBeInTheDocument()
    expect(screen.getByText(/x = 2\s+or\s+x = -8/)).toBeInTheDocument()
    expect(screen.getByText('Take the square root of both sides')).toBeInTheDocument()
    expect(screen.getByText('KEY STEP')).toBeInTheDocument()
    expect(screen.getByText('STUDENT ERROR')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'TUTOR ASSIST' }))
    expect(screen.getByText('The Mistake')).toBeInTheDocument()
  })

  it('calls the mark-step handler from the populated steps state', () => {
    const onMarkStep = vi.fn()
    renderPanel({ onMarkStep })

    fireEvent.click(screen.getByRole('tab', { name: 'STEPS' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark on board' })[0])

    expect(onMarkStep).toHaveBeenCalledWith(1)
  })

  it('maps the legacy help-request tab to tutor assist', () => {
    renderPanel({ activeTab: 'help-request' })

    expect(screen.getByRole('tab', { name: 'TUTOR ASSIST' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('The Mistake')).toBeInTheDocument()
  })

  it('shows the tutor assist ready state without auto-running analysis', () => {
    const onStartAnalysis = vi.fn()
    renderPanel({ activeTab: 'ai-tutor', initialTutorAssistState: 'ready', onStartAnalysis })

    expect(screen.getByRole('heading', { name: 'Tutor AI Assistant' })).toBeInTheDocument()
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

    expect(screen.getByText('The Mistake')).toBeInTheDocument()
    expect(screen.getByText('How to Guide')).toBeInTheDocument()
    expect(screen.getByText('Encouragement Scripts')).toBeInTheDocument()
    expect(screen.getByText('Memory Tricks')).toBeInTheDocument()
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

  it('shows the tutor assist annotate action in the mistake section', () => {
    renderPanel({ activeTab: 'ai-tutor' })

    expect(screen.getByRole('button', { name: 'Annotate' })).toBeInTheDocument()
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