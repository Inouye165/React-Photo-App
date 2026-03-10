import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Lightbulb,
  List,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Sparkles,
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

type WorkflowSectionState = Record<VisibleTabId, boolean>
type PanelVariant = 'workflow' | 'detail'

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

type TutorAssistActionCardId = 'coaching' | 'board' | 'fallback' | 'encouragement'

type StepCard = {
  number: number
  title: string
  detail: string
  tag?: 'KEY STEP' | 'STUDENT ERROR'
}

type TutorQuickAction = {
  id: string
  label: string
  hint: string
  message: string
}

type TutorAssistActionCard = {
  id: TutorAssistActionCardId
  title: string
  recommendation: string
  rationale: string
  composerText?: string
  optional?: boolean
}

type BoardActionSource = 'diagnosis' | 'response' | 'assist'
type BoardActionMode = 'mark' | 'annotate'

type BoardActionContext = {
  source: BoardActionSource
  mode: BoardActionMode
  stepNumber: number
  stepTitle: string
  statusText: string
  sourceText: string
  responsePrompt: string
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

const DEFAULT_WORKFLOW_SECTION_STATE: WorkflowSectionState = {
  steps: true,
  chat: true,
  'ai-tutor': false,
}

const WORKFLOW_SECTION_ORDER: Array<{
  id: VisibleTabId
  title: string
  subtitle: string
  Icon: LucideIcon
  accentClassName: string
  sectionClassName?: string
}> = [
  {
    id: 'steps',
    title: 'Diagnosis',
    subtitle: 'Likely mistake first, supporting steps underneath.',
    Icon: List,
    accentClassName: 'text-amber-300 bg-amber-500/12',
    sectionClassName: 'border-amber-400/20 shadow-[0_20px_40px_rgba(0,0,0,0.24)]',
  },
  {
    id: 'chat',
    title: 'Response',
    subtitle: 'Choose the next tutor move and send it fast.',
    Icon: MessageSquareText,
    accentClassName: 'text-sky-300 bg-sky-500/12',
  },
  {
    id: 'ai-tutor',
    title: 'Assist',
    subtitle: 'Keep deeper coaching compact until you need it.',
    Icon: Sparkles,
    accentClassName: 'text-violet-300 bg-violet-500/12',
  },
]

const QUICK_REPLY_CHIPS = ['Great effort! 👍', "You're close!", "Let's try again", 'Check step 2']

const QUICK_TUTOR_ACTIONS: TutorQuickAction[] = [
  {
    id: 'encourage',
    label: 'Encourage progress',
    hint: 'Keep confidence high before redirecting.',
    message: 'Great effort so far. You are very close.',
  },
  {
    id: 'guide-root',
    label: 'Ask a guiding question',
    hint: 'Lead them back to the missing negative root.',
    message: 'What other number, besides 5, also squares to 25?',
  },
  {
    id: 'return-step-2',
    label: 'Point back to step 2',
    hint: 'Refocus on the key transition in the work.',
    message: 'Check step 2 again and think about what happens after taking the square root.',
  },
  {
    id: 'redirect-visual',
    label: 'Prompt a board check',
    hint: 'Use the board to compare +5 and -5 visually.',
    message: 'Let’s compare (+5)^2 and (-5)^2 on the board and see what they have in common.',
  },
]

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
const PRIMARY_DIAGNOSIS_ISSUE = SAMPLE_STEP_CARDS.find((step) => step.tag === 'STUDENT ERROR') ?? SAMPLE_STEP_CARDS[1]
const PRIMARY_KEY_STEP = SAMPLE_STEP_CARDS.find((step) => step.tag === 'KEY STEP') ?? SAMPLE_STEP_CARDS[1]

function getStepCard(stepNumber: number): StepCard {
  return SAMPLE_STEP_CARDS.find((step) => step.number === stepNumber) ?? PRIMARY_KEY_STEP
}

function getLikelyIssueSummary(issue: StepCard, keyStep: StepCard): string {
  if (/negative root/i.test(issue.detail)) {
    return `Student missed the negative square root at step ${keyStep.number}.`
  }

  return issue.detail
}

function createBoardActionContext(stepNumber: number, mode: BoardActionMode, source: BoardActionSource): BoardActionContext {
  const step = getStepCard(stepNumber)
  const sourceText = source === 'diagnosis' ? 'From Diagnosis' : source === 'assist' ? 'From Assist' : 'From Response'

  return {
    source,
    mode,
    stepNumber,
    stepTitle: step.title,
    statusText: `${mode === 'annotate' ? 'Annotating' : 'Marking'} step ${stepNumber}`,
    sourceText,
    responsePrompt: `Reply about step ${stepNumber}`,
  }
}

function isBoardActionActive(
  boardActionContext: BoardActionContext | null,
  source: BoardActionSource,
  mode: BoardActionMode,
  stepNumber: number,
): boolean {
  return Boolean(
    boardActionContext
    && boardActionContext.source === source
    && boardActionContext.mode === mode
    && boardActionContext.stepNumber === stepNumber,
  )
}

const TUTOR_ASSIST_STORAGE_KEY = 'photo-app:right-panel:tutor-assist:v1'
let tutorAssistSessionCache: { viewState: TutorAssistViewState; notes: string } | null = null

const TUTOR_ASSIST_ACTION_CARDS: TutorAssistActionCard[] = [
  {
    id: 'coaching',
    title: 'Best coaching move',
    recommendation: 'Ask one short guiding question first: "What other number, besides 5, also squares to 25?"',
    rationale: 'This keeps the student doing the thinking and redirects them back to the missing negative root without dumping the whole correction.',
    composerText: 'What other number, besides 5, also squares to 25?',
  },
  {
    id: 'board',
    title: 'Best annotate-on-board move',
    recommendation: 'Mark step 2, then compare (+5)^2 and (-5)^2 side by side so both roots become visible.',
    rationale: 'The student already set up the equation correctly. A quick visual comparison makes the missed pair concrete faster than another paragraph in chat.',
  },
  {
    id: 'fallback',
    title: 'Best fallback explanation',
    recommendation: 'If they are still stuck, explain: taking a square root while solving gives both + and -, so x + 3 = ±5 and the solutions are x = 2 and x = -8.',
    rationale: 'This compresses the core correction into one tutor-facing explanation and preserves the useful logic from the longer assist write-up.',
    composerText: 'When you take a square root while solving, both + and - can work. Here that means x + 3 = ±5, so the solutions are x = 2 and x = -8.',
  },
  {
    id: 'encouragement',
    title: 'Confidence phrase',
    recommendation: 'Keep the redirect warm: "You set it up correctly. There is just one second answer hiding here."',
    rationale: 'This preserves the encouragement-script value from earlier phases while keeping it secondary to the stronger coaching and board moves.',
    composerText: 'You set it up correctly. There is just one second answer hiding here.',
    optional: true,
  },
]

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

function createInitialWorkflowSections(preferredTab: VisibleTabId): WorkflowSectionState {
  return {
    ...DEFAULT_WORKFLOW_SECTION_STATE,
    [preferredTab]: true,
  }
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
  messages,
  composerValue,
  onComposerValueChange,
  onApplyComposerText,
  onSendMessage,
  boardActionContext,
  onBoardAction,
  studentName = 'Student',
  studentPresence = 'offline',
  studentLastSeenText = 'Last seen 2 hrs ago',
  variant = 'detail',
}: {
  messages: TutorMessage[]
  composerValue: string
  onComposerValueChange: (value: string) => void
  onApplyComposerText: (text: string, mode?: 'append' | 'replace') => void
  onSendMessage: () => void
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  studentName?: string
  studentPresence?: 'online' | 'offline'
  studentLastSeenText?: string
  variant?: PanelVariant
}): React.JSX.Element {
  const threadRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useAutoResizeTextarea(composerValue)
  const studentInitials = useMemo(() => buildStudentInitials(studentName), [studentName])
  const visibleMessages = variant === 'workflow' ? messages.slice(-2) : messages

  useEffect(() => {
    const container = threadRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages])

  const handleChipClick = (chipText: string) => {
    onApplyComposerText(chipText, 'append')
    textareaRef.current?.focus()
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSendMessage()
    }
  }

  const handleAnnotateIssue = () => {
    onBoardAction(PRIMARY_KEY_STEP.number, 'annotate', 'response')
  }

  if (variant === 'workflow') {
    return (
      <div className="bg-transparent px-4 pb-4 pt-1">
        <div className="rounded-[14px] border border-sky-400/20 bg-[linear-gradient(180deg,rgba(30,58,95,0.34),rgba(17,24,39,0.92))] px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-200/80">Recommended next move</div>
              <div className="mt-1 text-[15px] font-semibold text-[#F9FAFB]">Guide {studentName} back to the missing negative root.</div>
              <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">Best next step: ask a short guiding question before explaining the full correction.</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1F2937] text-[12px] font-semibold text-[#F9FAFB]">
              {studentInitials}
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleChipClick('What other number, besides 5, also squares to 25?')}
            className="mt-3 inline-flex rounded-[10px] bg-[#F59E0B] px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-[#f2ab28]"
          >
            Use suggested reply
          </button>

          <div className="mt-3 flex items-center gap-2 text-[12px] text-[#9CA3AF]">
            <span
              className={`h-2 w-2 rounded-full ${studentPresence === 'online' ? 'bg-[#10B981]' : 'bg-[#6B7280]'}`}
              aria-hidden="true"
            />
            <span>{studentPresence === 'online' ? 'Online now' : studentLastSeenText}</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Tutoring moves</div>
          <div className="mt-2 grid gap-2">
            {QUICK_TUTOR_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleChipClick(action.message)}
                className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-amber-400/30 hover:bg-white/[0.05]"
              >
                <div className="text-[13px] font-semibold text-[#F9FAFB]">{action.label}</div>
                <div className="mt-1 text-[12px] leading-5 text-[#9CA3AF]">{action.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Board action</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onBoardAction(PRIMARY_KEY_STEP.number, 'mark', 'response')}
              className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                isBoardActionActive(boardActionContext, 'response', 'mark', PRIMARY_KEY_STEP.number)
                  ? 'border-amber-300/50 bg-amber-500/20 text-amber-50'
                  : 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/15'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Mark key step on board
            </button>
            <button
              type="button"
              onClick={handleAnnotateIssue}
              className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-medium transition ${
                isBoardActionActive(boardActionContext, 'response', 'annotate', PRIMARY_KEY_STEP.number)
                  ? 'border-sky-300/40 bg-sky-500/12 text-sky-100'
                  : 'border-white/10 bg-white/[0.03] text-[#D1D5DB] hover:border-white/20 hover:text-[#F9FAFB]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Annotate issue
            </button>
          </div>
          <div className="mt-2 text-[11px] text-[#6B7280]">You can message, mark the board, or do both before opening full detail.</div>
        </div>

        <div className="mt-3 rounded-[14px] border border-white/10 bg-[#161f2d] p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Send response</div>
          {boardActionContext ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-50">
              <span className="font-semibold">Board focus:</span>
              <span>{boardActionContext.statusText}</span>
              <span className="text-amber-100/80">{boardActionContext.stepTitle}</span>
              <button
                type="button"
                onClick={() => onApplyComposerText(`Let's look at step ${boardActionContext.stepNumber} together.`, 'replace')}
                className="ml-auto rounded-[8px] border border-amber-300/30 px-2 py-1 text-[11px] font-semibold text-amber-50 transition hover:bg-amber-500/10"
              >
                {boardActionContext.responsePrompt}
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={composerValue}
              onChange={(event) => onComposerValueChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={1}
              placeholder="Send the next tutor move..."
              aria-label="Message student"
              className="min-h-[42px] flex-1 resize-none rounded-[10px] border border-[#374151] bg-[#111827] px-3 py-2 text-[14px] text-[#F9FAFB] outline-none placeholder:text-[#6B7280] focus:border-[#F59E0B]"
            />
            <button
              type="button"
              onClick={onSendMessage}
              disabled={!composerValue.trim()}
              className="h-[42px] shrink-0 rounded-[10px] bg-[#F59E0B] px-4 text-[14px] font-medium text-black transition hover:bg-[#f2ab28] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </div>
          <div className="mt-2 text-[11px] text-[#4B5563]">Messages are visible to both tutor and student</div>
        </div>

        {studentPresence === 'offline' ? (
          <div className="mt-2 text-[12px] text-[#6B7280]">Student is offline. They&apos;ll see your note when they return.</div>
        ) : null}

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Recent context</div>
          {visibleMessages.length === 0 ? (
            <div className="mt-2 text-[13px] text-[#6B7280]">No messages yet. Start the conversation here.</div>
          ) : (
            <div className="mt-2 space-y-3">
              {visibleMessages.map((message) => {
                const isTutor = message.sender === 'tutor'

                return (
                  <div key={message.id} className={`flex flex-col ${isTutor ? 'items-end' : 'items-start'}`}>
                    <div className={`mb-1 text-[11px] ${isTutor ? 'text-right' : 'text-left'} text-[#6B7280]`}>
                      {isTutor ? 'You' : studentName}
                    </div>
                    <div
                      className={`max-w-[88%] rounded-[12px] px-3 py-2 text-[13px] leading-6 text-[#F9FAFB] ${
                        isTutor
                          ? 'border border-[#374151] bg-[#1F2937]'
                          : `bg-[#374151] ${message.unread ? 'border-l-2 border-l-[#3B82F6] pl-[10px]' : ''}`
                      }`}
                    >
                      {message.body}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
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
        {boardActionContext ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[8px] border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-50">
            <span className="font-semibold">Board focus:</span>
            <span>{boardActionContext.statusText}</span>
            <span className="text-amber-100/80">{boardActionContext.stepTitle}</span>
            <button
              type="button"
              onClick={() => onApplyComposerText(`Let's look at step ${boardActionContext.stepNumber} together.`, 'replace')}
              className="ml-auto rounded-[8px] border border-amber-300/30 px-2 py-1 text-[11px] font-semibold text-amber-50 transition hover:bg-amber-500/10"
            >
              {boardActionContext.responsePrompt}
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={composerValue}
            onChange={(event) => onComposerValueChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            placeholder="Message student..."
            aria-label="Message student"
            className="min-h-[42px] flex-1 resize-none rounded-[8px] border border-[#374151] bg-[#111827] px-3 py-2 text-[14px] text-[#F9FAFB] outline-none placeholder:text-[#6B7280] focus:border-[#F59E0B]"
          />
          <button
            type="button"
            onClick={onSendMessage}
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

function StepStatePopulated({
  boardActionContext,
  onBoardAction,
  variant = 'detail',
}: {
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  variant?: PanelVariant
}): React.JSX.Element {
  if (variant === 'workflow') {
    return (
      <div className="space-y-4 pb-1">
        <section className="rounded-[14px] border border-amber-400/25 bg-[linear-gradient(180deg,rgba(120,53,15,0.28),rgba(17,24,39,0.92))] px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.2)]">
          <div className="text-[10px] uppercase tracking-[0.08em] text-amber-200/80">Likely issue</div>
          <div className="mt-1 text-[16px] font-semibold text-[#F9FAFB]">Likely issue: {getLikelyIssueSummary(PRIMARY_DIAGNOSIS_ISSUE, PRIMARY_KEY_STEP)}</div>
          <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">Student wrote √25 = +5 only, so they only found x = 2 and missed the second solution.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#7c2d12] bg-[#451a03] px-3 py-1 text-[11px] font-semibold text-amber-100">
              Key step: {PRIMARY_KEY_STEP.title}
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
              Answer pair: x = 2 or x = -8
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              title="Mark this step on the whiteboard"
              className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                isBoardActionActive(boardActionContext, 'diagnosis', 'mark', PRIMARY_KEY_STEP.number)
                  ? 'border-amber-300/50 bg-amber-500/20 text-amber-50'
                  : 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/15'
              }`}
              onClick={() => onBoardAction(PRIMARY_KEY_STEP.number, 'mark', 'diagnosis')}
            >
              <MapPin className="h-3.5 w-3.5" />
              Mark key step on board
            </button>
            <div className="inline-flex items-center rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-[#9CA3AF]">
              Best tutoring move: guide the student to discover the missing negative root.
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#8f867d]">Problem</div>
              <div className="mt-1 text-[14px] font-medium text-[#F9FAFB]">(x + 3)^2 - 5 = 20</div>
            </div>
            <div className="text-[11px] text-[#6B7280]">Supporting steps</div>
          </div>

          <div className="mt-3 space-y-2">
            {SAMPLE_STEP_CARDS.map((step) => (
              <article
                key={step.number}
                className={`rounded-[12px] border px-3 py-3 transition-colors ${
                  boardActionContext?.stepNumber === step.number
                    ? 'border-amber-300/35 bg-amber-500/[0.08]'
                    : 'border-white/8 bg-white/[0.03] hover:border-white/15'
                }`}
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
                        className={`flex items-center gap-1 text-[11px] transition ${
                          isBoardActionActive(boardActionContext, 'diagnosis', 'mark', step.number)
                            ? 'text-amber-300'
                            : 'text-slate-500 hover:text-amber-400'
                        }`}
                        onClick={() => onBoardAction(step.number, 'mark', 'diagnosis')}
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
        </section>
      </div>
    )
  }

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
          className={`rounded-[8px] border p-3 transition-colors ${
            boardActionContext?.stepNumber === step.number
              ? 'border-amber-300/35 bg-[#25211a]'
              : 'border-[#374151] bg-[#1F2937] hover:border-[#4B5563] hover:bg-[#252f3e]'
          }`}
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
                  className={`mt-2 flex items-center gap-1 text-[11px] transition ${
                    isBoardActionActive(boardActionContext, 'diagnosis', 'mark', step.number)
                      ? 'text-amber-300'
                      : 'text-slate-500 hover:text-amber-400'
                  }`}
                  onClick={() => onBoardAction(step.number, 'mark', 'diagnosis')}
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

function StepsPanel({
  boardActionContext,
  onBoardAction,
  variant = 'detail',
}: {
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  variant?: PanelVariant
}): React.JSX.Element {
  if (variant === 'workflow') {
    return (
      <div className="bg-transparent px-4 pb-4 pt-1">
        <StepStatePopulated boardActionContext={boardActionContext} onBoardAction={onBoardAction} variant="workflow" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111827] p-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StepStatePopulated boardActionContext={boardActionContext} onBoardAction={onBoardAction} variant="detail" />
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
        <h3 className="mt-4 text-[16px] font-semibold text-[#F9FAFB]">Tutor Assist</h3>
        <p className="mt-2 max-w-[260px] text-[13px] leading-6 text-[#9CA3AF]">
          Run a compact coaching pass when you want a fast tutor move, a board cue, or a fallback explanation.
        </p>

        <div className="mt-5 w-full rounded-[8px] border border-[#374151] bg-[#1F2937] px-4 py-3 text-left">
          {[
            'Best coaching move first',
            'Best board cue next',
            'Fallback wording if the student is still stuck',
          ].map((feature) => (
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

function TutorAssistPopulatedState({
  privateNotes,
  onPrivateNotesChange,
  onRerun,
  onUseReply,
  boardActionContext,
  onBoardAction,
  variant = 'detail',
}: {
  privateNotes: string
  onPrivateNotesChange: (value: string) => void
  onRerun: () => void
  onUseReply: (value: string) => void
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  variant?: PanelVariant
}): React.JSX.Element {
  const [openRationale, setOpenRationale] = useState<Record<TutorAssistActionCardId, boolean>>({
    coaching: false,
    board: false,
    fallback: false,
    encouragement: false,
  })

  const toggleRationale = (cardId: TutorAssistActionCardId) => {
    setOpenRationale((current) => ({ ...current, [cardId]: !current[cardId] }))
  }

  const handleAnnotateIssue = () => {
    onBoardAction(PRIMARY_KEY_STEP.number, 'annotate', 'assist')
  }

  return (
    <div className={`space-y-3 ${variant === 'detail' ? 'pb-4' : ''}`}>
      {variant === 'workflow' ? (
        <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Fast coaching backup</div>
          <div className="mt-1 text-[13px] leading-6 text-[#9CA3AF]">Use Assist when you need one sharp move, one board cue, or one fallback explanation.</div>
        </div>
      ) : null}

      {TUTOR_ASSIST_ACTION_CARDS.map((card) => (
        <section
          key={card.id}
          className={`rounded-[12px] border px-3 py-3 ${card.optional ? 'border-white/8 bg-white/[0.02]' : 'border-white/10 bg-white/[0.03]'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">{card.title}</div>
              <div className="mt-1 text-[13px] font-semibold text-[#F9FAFB]">{card.recommendation}</div>
            </div>
            {card.optional ? (
              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#6B7280]">
                Optional
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {card.id === 'board' ? (
              <>
                <button
                  type="button"
                  onClick={() => onBoardAction(PRIMARY_KEY_STEP.number, 'mark', 'assist')}
                  className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                    isBoardActionActive(boardActionContext, 'assist', 'mark', PRIMARY_KEY_STEP.number)
                      ? 'border-amber-300/50 bg-amber-500/20 text-amber-50'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/15'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Mark key step on board
                </button>
                <button
                  type="button"
                  onClick={handleAnnotateIssue}
                  className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-medium transition ${
                    isBoardActionActive(boardActionContext, 'assist', 'annotate', PRIMARY_KEY_STEP.number)
                      ? 'border-sky-300/40 bg-sky-500/12 text-sky-100'
                      : 'border-white/10 bg-white/[0.03] text-[#D1D5DB] hover:border-white/20 hover:text-[#F9FAFB]'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Annotate
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onUseReply(card.composerText ?? '')}
                className="inline-flex items-center rounded-[10px] bg-[#F59E0B] px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-[#f2ab28]"
                aria-label={card.id === 'fallback' ? 'Apply fallback explanation' : `Use ${card.title.toLowerCase()}`}
              >
                {card.id === 'fallback' ? 'Apply explanation' : 'Use as reply'}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => toggleRationale(card.id)}
            className="mt-3 text-[11px] font-medium text-[#6B7280] transition hover:text-[#9CA3AF]"
          >
            {openRationale[card.id] ? 'Hide why this helps' : 'Why this helps'}
          </button>

          {openRationale[card.id] ? <p className="mt-2 text-[12px] leading-6 text-[#9CA3AF]">{card.rationale}</p> : null}
        </section>
      ))}

      {variant === 'detail' ? (
        <div className="border-t border-[#374151] pt-3">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[#4B5563]">Private notes (tutor only)</div>
          <textarea
            value={privateNotes}
            onChange={(event) => onPrivateNotesChange(event.target.value)}
            rows={3}
            placeholder="Notes only you can see..."
            aria-label="Private tutor notes"
            className="mt-2 w-full resize-none rounded-[6px] border border-[#1F2937] bg-[#111827] px-3 py-2 text-[12px] text-[#9CA3AF] outline-none placeholder:text-[#4B5563]"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-[11px] text-[#4B5563]">Deeper rationale stays tucked behind each card.</div>
            <button type="button" onClick={onRerun} className="text-[11px] text-[#4B5563] transition hover:text-[#9CA3AF]">
              ↺ Re-run analysis
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TutorAssistPanel({
  initialState = 'populated',
  analysisLoading,
  onStartAnalysis,
  variant = 'detail',
  onUseReply,
  boardActionContext,
  onBoardAction,
}: {
  initialState?: TutorAssistViewState
  analysisLoading: boolean
  onStartAnalysis: () => void
  variant?: PanelVariant
  onUseReply: (value: string) => void
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
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

  if (variant === 'workflow') {
    return (
      <div className="bg-transparent px-4 pb-4 pt-1">
        {effectiveState === 'ready' ? (
          <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#8f867d]">Deeper assist</div>
                <div className="mt-1 text-[14px] font-semibold text-[#F9FAFB]">Open coaching help only when diagnosis and response need backup.</div>
              </div>
              <button
                type="button"
                onClick={runAnalysis}
                disabled={analysisLoading}
                className="shrink-0 rounded-[10px] bg-[#F59E0B] px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-[#f2ab28] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Analyze
              </button>
            </div>
            <div className="mt-2 text-[12px] leading-6 text-[#9CA3AF]">Keep Assist in reserve until you need a sharper coaching move.</div>
          </div>
        ) : null}

        {effectiveState === 'loading' ? (
          <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3 text-[13px] text-[#9CA3AF]">
            <div className="flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin text-[#F59E0B]" aria-hidden="true" />
              <span>Analyzing student work...</span>
            </div>
          </div>
        ) : null}

        {effectiveState === 'populated' ? (
          <TutorAssistPopulatedState
            privateNotes={privateNotes}
            onPrivateNotesChange={handlePrivateNotesChange}
            onRerun={runAnalysis}
            onUseReply={onUseReply}
            boardActionContext={boardActionContext}
            onBoardAction={onBoardAction}
            variant="workflow"
          />
        ) : null}
      </div>
    )
  }

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
            onUseReply={onUseReply}
            boardActionContext={boardActionContext}
            onBoardAction={onBoardAction}
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

function WorkflowSectionCard({
  title,
  subtitle,
  Icon,
  accentClassName,
  sectionClassName,
  isOpen,
  onToggle,
  onOpenDetail,
  children,
}: {
  title: string
  subtitle: string
  Icon: LucideIcon
  accentClassName: string
  sectionClassName?: string
  isOpen: boolean
  onToggle: () => void
  onOpenDetail: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const ChevronIcon = isOpen ? ChevronDown : ChevronRight

  return (
    <section className={`rounded-[16px] border border-white/10 bg-[linear-gradient(180deg,rgba(31,41,55,0.96),rgba(17,24,39,0.98))] shadow-[0_18px_36px_rgba(0,0,0,0.22)] ${sectionClassName ?? ''}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={isOpen}
        >
          <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${accentClassName}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">{title}</span>
            <span className="mt-1 block text-[13px] leading-[1.5] text-[#9CA3AF]">{subtitle}</span>
          </span>
          <ChevronIcon className="mt-1 h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onOpenDetail}
          className="shrink-0 text-[11px] font-medium text-[#6B7280] transition hover:text-[#D1D5DB]"
        >
          Full view
        </button>
      </div>

      {isOpen ? <div className="border-t border-white/10">{children}</div> : null}
    </section>
  )
}

const RightSidePanel: React.FC<RightSidePanelProps> = ({
  className = '',
  initialTab = 'steps',
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
  const requestedTab = useMemo(() => resolveVisibleTab(activeTab ?? initialTab), [activeTab, initialTab])
  const [detailTab, setDetailTab] = useState<VisibleTabId | null>(() => (requestedTab === 'steps' ? null : requestedTab))
  const [openSections, setOpenSections] = useState<WorkflowSectionState>(() => createInitialWorkflowSections(requestedTab))
  const [chatMessages, setChatMessages] = useState<TutorMessage[]>(() => initialChatMessages ?? SAMPLE_MESSAGES)
  const [chatComposerValue, setChatComposerValue] = useState('')
  const [boardActionContext, setBoardActionContext] = useState<BoardActionContext | null>(null)
  const [panelToastMessage, setPanelToastMessage] = useState<string | null>(null)
  const previousPresenceRef = useRef(studentPresence)
  const previousActiveTabRef = useRef<TabType | undefined>(activeTab)

  const resolvedWidth = typeof width === 'number' ? `${Math.max(width, 380)}px` : width

  const panelStyle: React.CSSProperties = {
    width: resolvedWidth,
    minWidth: '380px',
    backgroundColor: '#111827',
    fontFamily: '"DM Sans", sans-serif',
  }

  const handleOpenSection = (tabId: VisibleTabId) => {
    setOpenSections((current) => ({ ...current, [tabId]: !current[tabId] }))
  }

  const handleOpenDetail = (tabId: VisibleTabId) => {
    setOpenSections((current) => ({ ...current, [tabId]: true }))
    setDetailTab(tabId)
    onTabChange?.(tabId)
  }

  const handleDetailTabChange = (tabId: VisibleTabId) => {
    setOpenSections((current) => ({ ...current, [tabId]: true }))
    setDetailTab(tabId)
    onTabChange?.(tabId)
  }

  useEffect(() => {
    if (previousPresenceRef.current !== 'online' && studentPresence === 'online') {
      setPanelToastMessage(`${studentName} just came online`)
    }

    previousPresenceRef.current = studentPresence
  }, [studentName, studentPresence])

  useEffect(() => {
    if (activeTab && activeTab !== previousActiveTabRef.current) {
      const nextTab = resolveVisibleTab(activeTab)
      setOpenSections((current) => ({ ...current, [nextTab]: true }))
      setDetailTab(nextTab === 'steps' ? null : nextTab)
    }

    previousActiveTabRef.current = activeTab
  }, [activeTab])

  const handleApplyComposerText = (text: string, mode: 'append' | 'replace' = 'append') => {
    setChatComposerValue((current) => {
      if (mode === 'replace' || !current.trim()) {
        return text
      }

      return `${current} ${text}`
    })
  }

  const handleSendChatMessage = () => {
    const trimmed = chatComposerValue.trim()
    if (!trimmed) return

    setChatMessages((current) => [
      ...current,
      {
        id: `tutor-${Date.now()}`,
        sender: 'tutor',
        body: trimmed,
        timestamp: 'Just now',
      },
    ])
    setChatComposerValue('')
  }

  const handleUseAssistReply = (value: string) => {
    if (!value) return

    setOpenSections((current) => ({ ...current, chat: true, 'ai-tutor': true }))
    handleApplyComposerText(value, 'replace')

    if (detailTab === 'ai-tutor') {
      setDetailTab('chat')
      onTabChange?.('chat')
    }
  }

  const handleBoardAction = (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => {
    setBoardActionContext(createBoardActionContext(stepNumber, mode, source))

    if (mode === 'mark') {
      onMarkStep?.(stepNumber)
    }
  }

  const renderPanelContent = (tabId: VisibleTabId): React.JSX.Element => {
    if (tabId === 'chat') {
      return (
        <ChatPanel
          messages={chatMessages}
          composerValue={chatComposerValue}
          onComposerValueChange={setChatComposerValue}
          onApplyComposerText={handleApplyComposerText}
          onSendMessage={handleSendChatMessage}
          boardActionContext={boardActionContext}
          onBoardAction={handleBoardAction}
          studentName={studentName}
          studentPresence={studentPresence}
          studentLastSeenText={studentLastSeenText}
        />
      )
    }

    if (tabId === 'steps') {
      return <StepsPanel boardActionContext={boardActionContext} onBoardAction={handleBoardAction} />
    }

    if (tabId === 'ai-tutor') {
      return (
        <TutorAssistPanel
          initialState={initialTutorAssistState}
          analysisLoading={analysisLoading}
          onStartAnalysis={onStartAnalysis}
          onUseReply={handleUseAssistReply}
          boardActionContext={boardActionContext}
          onBoardAction={handleBoardAction}
        />
      )
    }

    return <EmptyPanelState tabId={tabId} />
  }

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

      <div className="shrink-0 border-b border-[#374151] bg-[linear-gradient(180deg,rgba(31,41,55,0.96),rgba(17,24,39,0.98))] px-4 py-3">
        {detailTab ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Tutor workflow</div>
                <div className="mt-1 text-[14px] font-semibold text-[#F9FAFB]">Focused detail view</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailTab(null)}
                className="text-[11px] font-medium text-[#9CA3AF] transition hover:text-[#F9FAFB]"
              >
                Back to workflow
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Workflow detail views">
              {WORKFLOW_SECTION_ORDER.map((section) => {
                const isActive = section.id === detailTab

                return (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleDetailTabChange(section.id)}
                    className={`rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                      isActive
                        ? 'border-amber-400/40 bg-amber-500/12 text-[#F9FAFB]'
                        : 'border-white/10 bg-white/[0.03] text-[#9CA3AF] hover:text-[#F9FAFB]'
                    }`}
                  >
                    {section.title}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Tutor workflow</div>
            <div className="mt-1 text-[14px] text-[#9CA3AF]">Diagnosis first. Response next. Assist when needed.</div>
          </div>
        )}
      </div>

      {boardActionContext ? (
        <div className="shrink-0 border-b border-white/10 bg-[linear-gradient(180deg,rgba(69,39,13,0.9),rgba(17,24,39,0.98))] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100/85">
            <span className="inline-flex h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" />
            Board focus active
          </div>
          <div className="mt-1 flex items-center gap-3 text-[13px] text-[#F9FAFB]">
            <span>{boardActionContext.statusText}</span>
            <span className="text-[#d9c7a7]">{boardActionContext.stepTitle}</span>
            <span className="text-[#9CA3AF]">{boardActionContext.sourceText}</span>
            <button
              type="button"
              onClick={() => setBoardActionContext(null)}
              className="ml-auto text-[11px] font-medium text-[#D1D5DB] transition hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden bg-[#111827]">
        {detailTab ? (
          <section className="h-full min-h-0 p-4">
            <div className="h-full overflow-hidden rounded-[16px] border border-white/10 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
              {renderPanelContent(detailTab)}
            </div>
          </section>
        ) : (
          <div className="h-full overflow-y-auto p-4">
            <div className="space-y-4 pb-4">
              {WORKFLOW_SECTION_ORDER.map((section) => (
                <WorkflowSectionCard
                  key={section.id}
                  title={section.title}
                  subtitle={section.subtitle}
                  Icon={section.Icon}
                  accentClassName={section.accentClassName}
                  sectionClassName={section.sectionClassName}
                  isOpen={openSections[section.id]}
                  onToggle={() => handleOpenSection(section.id)}
                  onOpenDetail={() => handleOpenDetail(section.id)}
                >
                  {section.id === 'steps' ? (
                    <StepsPanel boardActionContext={boardActionContext} onBoardAction={handleBoardAction} variant="workflow" />
                  ) : section.id === 'chat' ? (
                    <ChatPanel
                      messages={chatMessages}
                      composerValue={chatComposerValue}
                      onComposerValueChange={setChatComposerValue}
                      onApplyComposerText={handleApplyComposerText}
                      onSendMessage={handleSendChatMessage}
                      boardActionContext={boardActionContext}
                      onBoardAction={handleBoardAction}
                      studentName={studentName}
                      studentPresence={studentPresence}
                      studentLastSeenText={studentLastSeenText}
                      variant="workflow"
                    />
                  ) : (
                    <TutorAssistPanel
                      initialState={initialTutorAssistState}
                      analysisLoading={analysisLoading}
                      onStartAnalysis={onStartAnalysis}
                      variant="workflow"
                      onUseReply={handleUseAssistReply}
                      boardActionContext={boardActionContext}
                      onBoardAction={handleBoardAction}
                    />
                  )}
                </WorkflowSectionCard>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export default RightSidePanel
