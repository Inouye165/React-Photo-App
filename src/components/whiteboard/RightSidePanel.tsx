import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  List,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { TutorLessonMessage } from './tabs/AITutorTab'

export type TabType = 'ai-tutor' | 'help-request' | 'chat' | 'steps'

export interface RightSidePanelProps {
  className?: string
  initialTab?: TabType
  activeTab?: TabType
  initialChatMessages?: ChatPreviewMessage[]
  initialTutorAssistState?: TutorAssistViewState
  studentName?: string
  studentPresence?: 'online' | 'offline'
  studentLastSeenText?: string
  panelMode?: 'student' | 'tutor'
  width?: string | number
  backgroundColor?: string
  onTabChange?: (tab: TabType) => void
  hasPhoto: boolean
  hasBoardContent?: boolean
  hasInput?: boolean
  inputMode?: 'photo' | 'text'
  problemDraft?: string
  helpRequestDraft?: string
  onHelpRequestDraftChange?: (value: string) => void
  activeHelpRequest?: unknown
  helpRequestSubmitting?: boolean
  helpRequestError?: string | null
  onSubmitHelpRequest?: () => void
  readyIntent?: 'analyze' | 'solve' | 'steps'
  onReadyIntentChange?: (value: 'analyze' | 'solve' | 'steps') => void
  onProblemDraftChange?: (value: string) => void
  analysis: unknown
  analysisResult?: unknown
  analysisLoading: boolean
  analysisError: string | null
  onStartAnalysis: () => void
  onRetryAnalysis: () => void
  responseAge: string
  responseAgeInvalid: boolean
  onResponseAgeChange: (value: string) => void
  tutorDraft: string
  tutorSubmitting: boolean
  onTutorDraftChange: (value: string) => void
  onTutorSubmit: () => void
  onRequestHumanTutor: () => void
  onLessonMessageChange?: (message: TutorLessonMessage | null) => void
  activeTutorStepId?: string | null
  overlayVisible?: boolean
  tutorPlaybackCanPlay?: boolean
  tutorPlaybackIsPlaying?: boolean
  onToggleTutorOverlay?: () => void
  onTutorPlaybackPlay?: () => void
  onTutorPlaybackPause?: () => void
  onTutorPlaybackPrevious?: () => void
  onTutorPlaybackNext?: () => void
  onTutorPlaybackReplay?: () => void
  onTutorStepSelect?: (stepId: string) => void
  onMarkStep?: (stepNumber: number) => void
}

type VisibleTabId = 'chat' | 'steps' | 'ai-tutor'

type EmptyStateConfig = {
  headline: string
  subtext: string
  Icon: LucideIcon
}

type TutorMessage = {
  id: string
  sender: 'student' | 'tutor'
  body: string
  timestamp: string
  unread?: boolean
}

export type ChatPreviewMessage = TutorMessage

type TutorAssistViewState = 'ready' | 'loading' | 'populated'

type TutorAssistSectionId = 'mistake' | 'guide' | 'scripts' | 'memory'

type TutorAssistSectionConfig = {
  id: TutorAssistSectionId
  title: string
  borderColor: string
  accentColor: string
  Icon: LucideIcon
}

type StepCard = {
  number: number
  title: string
  detail: string
  tag?: 'KEY STEP' | 'STUDENT ERROR'
}

const EMPTY_STATES: Record<VisibleTabId, EmptyStateConfig> = {
  chat: {
    Icon: MessageSquareText,
    headline: 'No messages yet',
    subtext: 'Messages between you and the student will appear here',
  },
  steps: {
    Icon: List,
    headline: 'No steps yet',
    subtext: 'Run AI analysis to generate solution steps',
  },
  'ai-tutor': {
    Icon: Lightbulb,
    headline: 'Ready to analyze',
    subtext: 'Request AI help to see coaching guidance',
  },
}

const TAB_ORDER: Array<{ id: VisibleTabId; label: string }> = [
  { id: 'chat', label: 'CHAT' },
  { id: 'steps', label: 'STEPS' },
  { id: 'ai-tutor', label: 'TUTOR ASSIST' },
]

const QUICK_REPLY_CHIPS = ['Great effort! 👍', "You're close!", "Let's try again", 'Check step 2']

const SAMPLE_MESSAGES: TutorMessage[] = [
  {
    id: 'student-1',
    sender: 'student',
    body: "I'm not sure what I did wrong on step 3",
    timestamp: '35 min ago',
    unread: true,
  },
  {
    id: 'tutor-1',
    sender: 'tutor',
    body: 'Let me take a look!',
    timestamp: '10 min ago',
  },
]

const SAMPLE_STEP_CARDS: StepCard[] = [
  {
    number: 1,
    title: 'Add 5 to both sides',
    detail: '(x + 3)^2 = 25',
  },
  {
    number: 2,
    title: 'Take the square root of both sides',
    detail: 'x + 3 = +-5  (remember the +- !)',
    tag: 'KEY STEP',
  },
  {
    number: 3,
    title: 'Solve the positive case: x + 3 = 5',
    detail: 'x = 2',
  },
  {
    number: 4,
    title: 'Solve the negative case: x + 3 = -5',
    detail: 'x = -8',
  },
  {
    number: 5,
    title: 'Student error identified at Step 2',
    detail: 'Student wrote √(25) = +5 only - missed the negative root',
    tag: 'STUDENT ERROR',
  },
]

const TUTOR_ASSIST_STORAGE_KEY = 'photo-app:right-panel:tutor-assist:v1'
let tutorAssistSessionCache: { viewState: TutorAssistViewState; notes: string } | null = null

const TUTOR_ASSIST_FEATURES = [
  'Identifies exactly where the student went wrong',
  'Coaches you on how to guide - not just correct',
  'Provides mnemonics and encouragement scripts',
]

const TUTOR_ASSIST_SECTIONS: TutorAssistSectionConfig[] = [
  {
    id: 'mistake',
    title: 'The Mistake',
    borderColor: '#EF4444',
    accentColor: '#EF4444',
    Icon: TriangleAlert,
  },
  {
    id: 'guide',
    title: 'How to Guide',
    borderColor: '#3B82F6',
    accentColor: '#3B82F6',
    Icon: Lightbulb,
  },
  {
    id: 'scripts',
    title: 'Encouragement Scripts',
    borderColor: '#10B981',
    accentColor: '#10B981',
    Icon: MessageSquareText,
  },
  {
    id: 'memory',
    title: 'Memory Tricks',
    borderColor: '#8B5CF6',
    accentColor: '#8B5CF6',
    Icon: Brain,
  },
]

const DEFAULT_TUTOR_SECTION_STATE: Record<TutorAssistSectionId, boolean> = {
  mistake: true,
  guide: true,
  scripts: true,
  memory: true,
}

function readStoredTutorAssistState(): { viewState: TutorAssistViewState; notes: string } | null {
  if (typeof window === 'undefined') return tutorAssistSessionCache

  try {
    const raw = window.localStorage.getItem(TUTOR_ASSIST_STORAGE_KEY)
    if (!raw) return tutorAssistSessionCache
    const parsed = JSON.parse(raw) as { viewState?: TutorAssistViewState; notes?: string }
    tutorAssistSessionCache = {
      viewState: parsed.viewState === 'ready' || parsed.viewState === 'loading' || parsed.viewState === 'populated'
        ? parsed.viewState
        : 'populated',
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    }
    return tutorAssistSessionCache
  } catch {
    return tutorAssistSessionCache
  }
}

function writeStoredTutorAssistState(viewState: TutorAssistViewState, notes: string): void {
  tutorAssistSessionCache = { viewState, notes }
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(TUTOR_ASSIST_STORAGE_KEY, JSON.stringify({ viewState, notes }))
  } catch {
    // Fall back to the in-memory cache when storage is unavailable.
  }
}

export function __resetTutorAssistPersistenceForTests(): void {
  tutorAssistSessionCache = null
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(TUTOR_ASSIST_STORAGE_KEY)
  } catch {
    // Ignore storage cleanup failures in test and non-browser environments.
  }
}

function resolveVisibleTab(tab?: TabType): VisibleTabId {
  if (tab === 'steps') return 'steps'
  if (tab === 'ai-tutor' || tab === 'help-request') return 'ai-tutor'
  return 'chat'
}

function buildStudentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'ST'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'ST'
}

function useAutoResizeTextarea(value: string) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return

    element.style.height = '0px'
    const computed = window.getComputedStyle(element)
    const lineHeight = Number.parseFloat(computed.lineHeight || '20') || 20
    const borderHeight = Number.parseFloat(computed.borderTopWidth || '0') + Number.parseFloat(computed.borderBottomWidth || '0')
    const maxHeight = lineHeight * 4 + borderHeight + 16
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [value])

  return textareaRef
}

function ChatPanel({
  initialMessages = SAMPLE_MESSAGES,
  studentName = 'Student',
  studentPresence = 'offline',
  studentLastSeenText = 'Last seen 2 hrs ago',
}: {
  initialMessages?: ChatPreviewMessage[]
  studentName?: string
  studentPresence?: 'online' | 'offline'
  studentLastSeenText?: string
}): React.JSX.Element {
  const [messages, setMessages] = useState<TutorMessage[]>(initialMessages)
  const [composerValue, setComposerValue] = useState('')
  const threadRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useAutoResizeTextarea(composerValue)
  const studentInitials = useMemo(() => buildStudentInitials(studentName), [studentName])

  useEffect(() => {
    const container = threadRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages])

  const handleChipClick = (chipText: string) => {
    setComposerValue((current) => (current.trim() ? `${current} ${chipText}` : chipText))
    textareaRef.current?.focus()
  }

  const handleSendMessage = () => {
    const trimmed = composerValue.trim()
    if (!trimmed) return

    setMessages((current) => [
      ...current,
      {
        id: `tutor-${Date.now()}`,
        sender: 'tutor',
        body: trimmed,
        timestamp: 'Just now',
      },
    ])
    setComposerValue('')
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#111827]">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[#374151] bg-[#1a2332] px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#374151] text-[12px] font-semibold text-[#F9FAFB]">
          {studentInitials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-[#F9FAFB]">{studentName}</div>
          <div className="flex items-center gap-1.5 text-[12px]">
            <span
              className={`h-2 w-2 rounded-full ${studentPresence === 'online' ? 'bg-[#10B981]' : 'bg-[#6B7280]'}`}
              aria-hidden="true"
            />
            <span className={studentPresence === 'online' ? 'text-[#10B981]' : 'text-[#6B7280]'}>
              {studentPresence === 'online' ? 'Online now' : studentLastSeenText}
            </span>
          </div>
        </div>
      </div>

      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto bg-[#111827] px-3 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="mx-auto flex max-w-[240px] flex-col items-center gap-3">
              <MessageSquareText className="h-10 w-10 text-[#374151]" strokeWidth={1.75} aria-hidden="true" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-[#9CA3AF]">No messages yet</h3>
                <p className="text-sm text-[#6B7280]">Start the conversation below</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end gap-4">
            {messages.map((message) => {
              const isTutor = message.sender === 'tutor'

              return (
                <div key={message.id} className={`flex flex-col ${isTutor ? 'items-end' : 'items-start'}`}>
                  <div className={`mb-1 text-[11px] ${isTutor ? 'text-right' : 'text-left'} text-[#6B7280]`}>
                    {isTutor ? 'You' : studentName}
                  </div>
                  <div
                    className={`max-w-[85%] px-3 py-2 text-[14px] leading-6 text-[#F9FAFB] ${
                      isTutor
                        ? 'rounded-[12px_12px_2px_12px] border border-[#374151] bg-[#1F2937]'
                        : `rounded-[12px_12px_12px_2px] bg-[#374151] ${message.unread ? 'border-l-2 border-l-[#3B82F6] pl-[10px]' : ''}`
                    }`}
                  >
                    {message.body}
                  </div>
                  <div className={`mt-1 text-[11px] ${isTutor ? 'text-right' : 'text-left'} text-[#4B5563]`}>
                    {message.timestamp}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {studentPresence === 'offline' ? (
        <div className="shrink-0 bg-[#1F2937] px-3 py-2 text-center text-[12px] text-[#6B7280]">
          Student is offline - they'll see your message when they return
        </div>
      ) : null}

      <div className="shrink-0 bg-[#111827] px-3 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_REPLY_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChipClick(chip)}
              className="shrink-0 rounded-full border border-[#374151] bg-[#1F2937] px-[10px] py-1 text-[12px] text-[#D1D5DB]"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-[#374151] bg-[#1F2937] p-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={composerValue}
            onChange={(event) => setComposerValue(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            placeholder="Message student..."
            aria-label="Message student"
            className="min-h-[42px] flex-1 resize-none rounded-[8px] border border-[#374151] bg-[#111827] px-3 py-2 text-[14px] text-[#F9FAFB] outline-none placeholder:text-[#6B7280] focus:border-[#F59E0B]"
          />
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={!composerValue.trim()}
            className="h-[42px] shrink-0 rounded-[8px] bg-[#F59E0B] px-4 text-[14px] font-medium text-black transition hover:bg-[#f2ab28] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>
        <div className="mt-2 text-[11px] text-[#4B5563]">Messages are visible to both tutor and student</div>
      </div>
    </div>
  )
}

function StepTag({ value }: { value: StepCard['tag'] }): React.JSX.Element | null {
  if (!value) return null

  const className = value === 'KEY STEP'
    ? 'bg-[#1E3A5F] text-[#60A5FA]'
    : 'bg-[#450A0A] text-[#F87171]'

  return <span className={`rounded-[4px] px-2 py-[2px] text-[10px] font-medium ${className}`}>{value}</span>
}

function StepStatePopulated({ onMarkStep }: { onMarkStep?: (stepNumber: number) => void }): React.JSX.Element {
  return (
    <div className="space-y-3 pb-4">
      <section className="rounded-[8px] border border-[#374151] bg-[#1F2937] px-[14px] py-[10px]">
        <div className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280]">PROBLEM</div>
        <div className="mt-1 text-[15px] font-medium text-[#F9FAFB]">(x + 3)^2 - 5 = 20</div>
        <div className="mt-2 inline-flex rounded-full bg-[#064E3B] px-[10px] py-[2px] text-[12px] text-[#10B981]">
          x = 2  or  x = -8
        </div>
      </section>

      {SAMPLE_STEP_CARDS.map((step) => (
        <article
          key={step.number}
          className="rounded-[8px] border border-[#374151] bg-[#1F2937] p-3 transition-colors hover:border-[#4B5563] hover:bg-[#252f3e]"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#78350F] text-[12px] font-bold text-[#F59E0B]">
              {step.number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[13px] font-medium text-[#F9FAFB]">{step.title}</h3>
                <StepTag value={step.tag} />
              </div>
              <p className="mt-1 text-[12px] text-[#9CA3AF]">{step.detail}</p>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  title="Mark this step on the whiteboard"
                  className="mt-2 flex items-center gap-1 text-[11px] text-slate-500 transition hover:text-amber-400"
                  onClick={() => onMarkStep?.(step.number)}
                >
                  <MapPin className="h-3 w-3" />
                  Mark on board
                </button>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function StepsPanel({ onMarkStep }: { onMarkStep?: (stepNumber: number) => void }): React.JSX.Element {
  const handleMarkStep = (stepNumber: number) => {
    if (onMarkStep) {
      onMarkStep(stepNumber)
      return
    }

    console.log('mark step', stepNumber)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111827] p-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StepStatePopulated onMarkStep={handleMarkStep} />
      </div>
    </div>
  )
}

function TutorAssistReadyState({
  isLoading,
  onAnalyze,
}: {
  isLoading: boolean
  onAnalyze: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="mx-auto flex max-w-[320px] flex-col items-center">
        <Sparkles className="h-9 w-9 text-[#F59E0B]" strokeWidth={1.8} aria-hidden="true" />
        <h3 className="mt-4 text-[16px] font-semibold text-[#F9FAFB]">Tutor AI Assistant</h3>
        <p className="mt-2 max-w-[260px] text-[13px] leading-6 text-[#9CA3AF]">
          Analyzes the student&apos;s work and coaches you on how to help them effectively.
        </p>

        <div className="mt-5 w-full rounded-[8px] border border-[#374151] bg-[#1F2937] px-4 py-3 text-left">
          {TUTOR_ASSIST_FEATURES.map((feature) => (
            <div key={feature} className="flex items-start gap-2 text-[13px] leading-6 text-[#D1D5DB]">
              <span className="text-[#F59E0B]">✦</span>
              <span>{feature}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={isLoading}
          className="mt-4 w-full rounded-[8px] bg-[#F59E0B] px-4 py-2.5 text-[14px] font-semibold text-black transition hover:bg-[#f2ab28] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Analyze Student Work
        </button>
        <div className="mt-2 text-[11px] text-[#4B5563]">AI analysis · only runs when you click</div>
      </div>
    </div>
  )
}

function TutorAssistLoadingState(): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-2 text-[13px] text-[#9CA3AF]">
        <LoaderCircle className="h-5 w-5 animate-spin text-[#F59E0B]" aria-hidden="true" />
        <span>Analyzing student work...</span>
      </div>

      <div className="space-y-[10px]">
        {['#374151', '#334155', '#3f3f46'].map((borderColor, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-[8px] bg-[#1F2937]"
            style={{ borderLeft: `4px solid ${borderColor}` }}
          />
        ))}
      </div>
    </div>
  )
}

function TutorAssistSection({
  config,
  isOpen,
  onToggle,
  headerAction,
  children,
}: {
  config: TutorAssistSectionConfig
  isOpen: boolean
  onToggle: () => void
  headerAction?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const ChevronIcon = isOpen ? ChevronDown : ChevronRight
  const AccentIcon = config.Icon

  return (
    <section className="rounded-[8px] bg-[#1F2937] px-4 py-3" style={{ borderLeft: `3px solid ${config.borderColor}` }}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-3">
            <AccentIcon className="h-4 w-4" style={{ color: config.accentColor }} aria-hidden="true" />
            <span className="text-[14px] font-semibold text-[#F9FAFB]">{config.title}</span>
          </div>
          <ChevronIcon className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
        </button>
        {headerAction ? <div className="ml-auto">{headerAction}</div> : null}
      </div>

      {isOpen ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}

function TutorAssistPopulatedState({
  privateNotes,
  onPrivateNotesChange,
  onRerun,
}: {
  privateNotes: string
  onPrivateNotesChange: (value: string) => void
  onRerun: () => void
}): React.JSX.Element {
  const [openSections, setOpenSections] = useState<Record<TutorAssistSectionId, boolean>>(DEFAULT_TUTOR_SECTION_STATE)

  const toggleSection = (sectionId: TutorAssistSectionId) => {
    setOpenSections((current) => ({ ...current, [sectionId]: !current[sectionId] }))
  }

  return (
    <div className="space-y-3 pb-4">
      <TutorAssistSection
        config={TUTOR_ASSIST_SECTIONS[0]}
        isOpen={openSections.mistake}
        onToggle={() => toggleSection('mistake')}
        headerAction={(
          <button
            type="button"
            className="ml-auto flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 transition hover:border-amber-500/50 hover:text-amber-400"
            title="Place an annotation marker on the whiteboard"
            onClick={() => console.log('annotate error')}
          >
            <MapPin className="h-3 w-3" />
            Annotate
          </button>
        )}
      >
        <div className="text-[13px] font-semibold text-[#F9FAFB]">Missed the negative square root</div>
        <p className="mt-2 text-[13px] leading-6 text-[#9CA3AF]">
          Student wrote √25 = +5 only. When taking the square root of both sides, the result must be ±5, giving two solutions:
          {' '}x = 2 and x = -8. The student only found x = 2.
        </p>
      </TutorAssistSection>

      <TutorAssistSection config={TUTOR_ASSIST_SECTIONS[1]} isOpen={openSections.guide} onToggle={() => toggleSection('guide')}>
        <ul className="space-y-2 text-[13px] leading-6 text-[#D1D5DB]">
          <li>Ask: &quot;What happens when you square both a positive and negative number?&quot; to lead them to discover ± themselves</li>
          <li>Show: write (+5)^2 = 25 and (-5)^2 = 25 side by side on the board to make it visual</li>
        </ul>
      </TutorAssistSection>

      <TutorAssistSection config={TUTOR_ASSIST_SECTIONS[2]} isOpen={openSections.scripts} onToggle={() => toggleSection('scripts')}>
        {[`
You got the first solution perfectly -
you're thinking in the right direction!
There's actually a second answer hiding in this problem.
Can you think about what other number, when squared, gives 25?
        `.trim(), `
Really good work setting up the equation correctly.
One small thing to check: square roots always have two
possible answers. What would the negative version look like?
        `.trim()].map((script, index) => (
          <div key={index} className="mb-2 rounded-[6px] border border-[#374151] bg-[#111827] px-3 py-2 last:mb-0">
            <div className="mb-2 flex items-start justify-end">
              <button type="button" className="text-[11px] text-[#F59E0B] hover:underline">
                Send to Chat
              </button>
            </div>
            <p className="text-[13px] italic leading-6 text-[#D1D5DB]">{script}</p>
          </div>
        ))}
      </TutorAssistSection>

      <TutorAssistSection config={TUTOR_ASSIST_SECTIONS[3]} isOpen={openSections.memory} onToggle={() => toggleSection('memory')}>
        <div className="space-y-3">
          <div>
            <div className="text-[13px] font-medium text-[#D1D5DB]">The ± Rule: &quot;Square roots come in pairs&quot;</div>
            <p className="mt-1 text-[13px] leading-6 text-[#9CA3AF]">
              Every time you take a square root to solve for x, ask: &quot;What&apos;s the evil twin?&quot; The positive answer always has a negative partner. Write ± the moment you see a square root.
            </p>
          </div>
          <div>
            <div className="text-[13px] font-medium text-[#D1D5DB]">FOIL reminder for expanding (x+3)^2</div>
            <p className="mt-1 text-[13px] leading-6 text-[#9CA3AF]">
              Students often write x^2+9. Remind them: (x+3)^2 = (x+3)(x+3) - must FOIL or use (a+b)^2 = a^2+2ab+b^2. The middle term 2ab = 6x is the one always forgotten.
            </p>
          </div>
        </div>
      </TutorAssistSection>

      <div className="border-t border-[#374151] pt-3">
        <div className="text-[10px] uppercase tracking-[0.08em] text-[#4B5563]">PRIVATE NOTES (tutor only)</div>
        <textarea
          value={privateNotes}
          onChange={(event) => onPrivateNotesChange(event.target.value)}
          rows={3}
          placeholder="Notes only you can see..."
          aria-label="Private tutor notes"
          className="mt-2 w-full resize-none rounded-[6px] border border-[#1F2937] bg-[#111827] px-3 py-2 text-[12px] text-[#9CA3AF] outline-none placeholder:text-[#4B5563]"
        />
        <div className="mt-2 text-right">
          <button type="button" onClick={onRerun} className="text-[11px] text-[#4B5563] transition hover:text-[#9CA3AF]">
            ↺ Re-run analysis
          </button>
        </div>
      </div>
    </div>
  )
}

function TutorAssistPanel({
  initialState = 'populated',
  analysisLoading,
  onStartAnalysis,
}: {
  initialState?: TutorAssistViewState
  analysisLoading: boolean
  onStartAnalysis: () => void
}): React.JSX.Element {
  const [viewState, setViewState] = useState<TutorAssistViewState>(() => readStoredTutorAssistState()?.viewState ?? initialState)
  const [privateNotes, setPrivateNotes] = useState<string>(() => readStoredTutorAssistState()?.notes ?? '')
  const loadingTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    writeStoredTutorAssistState(viewState, privateNotes)
  }, [privateNotes, viewState])

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current !== null) {
        window.clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [])

  const runAnalysis = () => {
    onStartAnalysis()
    setViewState('loading')

    if (loadingTimeoutRef.current !== null) {
      window.clearTimeout(loadingTimeoutRef.current)
    }

    loadingTimeoutRef.current = window.setTimeout(() => {
      setViewState('populated')
      loadingTimeoutRef.current = null
    }, 2000)
  }

  const handlePrivateNotesChange = (value: string) => {
    setPrivateNotes(value)
    writeStoredTutorAssistState(viewState, value)
  }

  const effectiveState = analysisLoading ? 'loading' : viewState

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111827] p-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {effectiveState === 'ready' ? <TutorAssistReadyState isLoading={analysisLoading} onAnalyze={runAnalysis} /> : null}
        {effectiveState === 'loading' ? <TutorAssistLoadingState /> : null}
        {effectiveState === 'populated' ? (
          <TutorAssistPopulatedState
            privateNotes={privateNotes}
            onPrivateNotesChange={handlePrivateNotesChange}
            onRerun={runAnalysis}
          />
        ) : null}
      </div>
    </div>
  )
}

function EmptyPanelState({ tabId }: { tabId: VisibleTabId }): React.JSX.Element {
  const { Icon, headline, subtext } = EMPTY_STATES[tabId]

  return (
    <div className="flex min-h-full items-center justify-center p-4 text-center">
      <div className="mx-auto flex max-w-[280px] flex-col items-center gap-4">
        <Icon className="h-10 w-10 text-[#6B7280]" strokeWidth={1.75} aria-hidden="true" />
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-[#F9FAFB]">{headline}</h3>
          <p className="text-sm leading-6 text-[#6B7280]">{subtext}</p>
        </div>
      </div>
    </div>
  )
}

const RightSidePanel: React.FC<RightSidePanelProps> = ({
  className = '',
  initialTab = 'chat',
  activeTab,
  initialChatMessages,
  initialTutorAssistState = 'populated',
  studentName = 'Student',
  studentPresence = 'offline',
  studentLastSeenText = 'Last seen 2 hrs ago',
  analysisLoading,
  onStartAnalysis,
  onMarkStep,
  width = 'clamp(380px, 35vw, 560px)',
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<VisibleTabId>(resolveVisibleTab(activeTab ?? initialTab))
  const [panelToastMessage, setPanelToastMessage] = useState<string | null>(null)
  const previousPresenceRef = useRef(studentPresence)
  const selectedTab = useMemo(() => resolveVisibleTab(activeTab ?? internalTab), [activeTab, internalTab])

  const resolvedWidth = typeof width === 'number' ? `${Math.max(width, 380)}px` : width

  const panelStyle: React.CSSProperties = {
    width: resolvedWidth,
    minWidth: '380px',
    backgroundColor: '#111827',
    fontFamily: '"DM Sans", sans-serif',
  }

  const handleTabChange = (tabId: VisibleTabId) => {
    setInternalTab(tabId)
    onTabChange?.(tabId)
  }

  useEffect(() => {
    if (previousPresenceRef.current !== 'online' && studentPresence === 'online') {
      setPanelToastMessage(`${studentName} just came online`)
    }

    previousPresenceRef.current = studentPresence
  }, [studentName, studentPresence])

  return (
    <aside
      className={`relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-white/10 shadow-[-16px_0_32px_rgba(0,0,0,0.28)] ${className}`}
      style={panelStyle}
    >
      {panelToastMessage ? (
        <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-[#F59E0B] px-4 py-2 text-[13px] font-medium text-black shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#10B981]" aria-hidden="true" />
            <span>{panelToastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setPanelToastMessage(null)}
            className="shrink-0 text-[16px] leading-none text-black/75 transition hover:text-black"
            aria-label="Dismiss presence notification"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="flex h-12 shrink-0 border-b border-[#374151] bg-[#1F2937]" role="tablist" aria-label="Right panel tabs">
        {TAB_ORDER.map((tab) => {
          const isActive = tab.id === selectedTab

          return (
            <button
              key={tab.id}
              id={`right-panel-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`right-panel-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              className={`h-full w-full border-b-2 px-3 text-[13px] uppercase tracking-[0.08em] transition-colors ${
                isActive
                  ? 'border-[#F59E0B] bg-[#111827] font-semibold text-[#F9FAFB]'
                  : 'border-transparent bg-transparent font-medium text-[#6B7280] hover:bg-[#1a2332] hover:text-[#D1D5DB]'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-[#111827]">
        {TAB_ORDER.map((tab) => {
          const isActive = tab.id === selectedTab

          return (
            <section
              key={tab.id}
              id={`right-panel-panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`right-panel-tab-${tab.id}`}
              aria-hidden={!isActive}
              className={isActive ? 'h-full min-h-0' : 'hidden'}
            >
              {tab.id === 'chat' ? (
                <ChatPanel
                  initialMessages={initialChatMessages}
                  studentName={studentName}
                  studentPresence={studentPresence}
                  studentLastSeenText={studentLastSeenText}
                />
              ) : tab.id === 'steps' ? (
                <StepsPanel onMarkStep={onMarkStep} />
              ) : tab.id === 'ai-tutor' ? (
                <TutorAssistPanel
                  initialState={initialTutorAssistState}
                  analysisLoading={analysisLoading}
                  onStartAnalysis={onStartAnalysis}
                />
              ) : (
                <EmptyPanelState tabId={tab.id} />
              )}
            </section>
          )
        })}
      </div>
    </aside>
  )
}

export default RightSidePanel
