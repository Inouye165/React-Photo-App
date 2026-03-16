import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Lightbulb,
  List,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { TutorLessonMessage } from './tabs/AITutorTab'
import type { TutorAnalysisResult, TutorStepAnalysis, WhiteboardTutorResponse } from '../../types/whiteboard'
import type { TutorStepStatus } from '../../types/whiteboard'
import { readStoredTutorAssistState, writeStoredTutorAssistState } from './tutorAssistPersistence'

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
  analysis: WhiteboardTutorResponse | null
  analysisResult?: TutorAnalysisResult | null
  analysisLoading: boolean
  analysisError: string | null
  analysisPendingConfirmation?: boolean
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
  onBoardActionContextChange?: (context: BoardActionContext | null) => void
  sessionState?: 'queued' | 'live' | 'async'
  sessionBadgeText?: string
  sessionSummaryText?: string
  sessionMetaText?: string | null
  sessionSubjectText?: string | null
  sessionGradeText?: string | null
  onPickUpSession?: () => void
  onPassSession?: () => void
}

type VisibleTabId = 'chat' | 'steps' | 'ai-tutor'
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

type ResponseRecommendation = {
  title: string
  detail: string
  suggestedReply: string
  quickActions: TutorQuickAction[]
}

type BoardActionSource = 'diagnosis' | 'response' | 'assist'
type BoardActionMode = 'mark' | 'annotate'

export type BoardActionContext = {
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

const SHOULD_LOG_TUTOR_FIX_DEBUG = import.meta.env.DEV

function tutorFixDebug(label: string, details: Record<string, unknown>): void {
  if (!SHOULD_LOG_TUTOR_FIX_DEBUG) return
  console.info('[TUTOR-FIX-DEBUG]', label, details)
}

function toSentenceCase(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

function getReadableStudentReference(studentName: string): string {
  const trimmed = studentName.trim()
  if (!trimmed) return 'the student'

  const firstName = trimmed.split(/\s+/)[0] ?? trimmed
  if (/^(student|tutor|test|user|guest)$/i.test(firstName)) {
    return 'the student'
  }

  return firstName
}

function getAnalysisSourceLabel(analysis: WhiteboardTutorResponse | null): string | null {
  switch (analysis?.cacheSource) {
    case 'local-cache':
      return 'Showing saved analysis'
    case 'server-cache':
      return 'Showing server-cached analysis'
    case 'fresh':
      return 'Fresh AI analysis'
    default:
      return null
  }
}

function buildStepCards(analysisResult: TutorAnalysisResult | null): StepCard[] {
  if (!analysisResult?.steps.length) {
    return []
  }

  const issueIndex = analysisResult.steps.findIndex((step) => step.status !== 'correct')
  const fallbackKeyIndex = analysisResult.steps.findIndex((step) => step.status === 'correct')
  const keyIndex = issueIndex > 0 ? issueIndex - 1 : fallbackKeyIndex >= 0 ? fallbackKeyIndex : 0

  return analysisResult.steps.map((step, index) => ({
    number: index + 1,
    title: step.shortLabel?.trim() || `Step ${index + 1}`,
    detail: step.kidFriendlyExplanation?.trim() || step.correction?.trim() || step.hint?.trim() || step.studentText?.trim() || step.normalizedMath?.trim() || 'Review this step.',
    tag: index === issueIndex
      ? 'STUDENT ERROR'
      : index === keyIndex
        ? 'KEY STEP'
        : undefined,
  }))
}

function getPrimaryDiagnosisIssue(stepCards: StepCard[]): StepCard {
  return stepCards.find((step) => step.tag === 'STUDENT ERROR') ?? stepCards[1] ?? stepCards[0] ?? { number: 1, title: 'Step 1', detail: '' }
}

function getPrimaryKeyStep(stepCards: StepCard[], issue: StepCard): StepCard {
  return stepCards.find((step) => step.tag === 'KEY STEP')
    ?? stepCards[Math.max(0, issue.number - 2)]
    ?? issue
    ?? { number: 1, title: 'Step 1', detail: '' }
}

function getStructuredStep(analysisResult: TutorAnalysisResult | null, stepCard: StepCard): TutorStepAnalysis | null {
  return analysisResult?.steps[stepCard.number - 1] ?? null
}

function getProblemText(analysis: WhiteboardTutorResponse | null, analysisResult: TutorAnalysisResult | null): string {
  return analysisResult?.problemText?.trim() || analysis?.problem?.trim() || ''
}

function getAnswerPairText(analysis: WhiteboardTutorResponse | null, analysisResult: TutorAnalysisResult | null): string {
  const structuredAnswers = analysisResult?.finalAnswers?.filter(Boolean) ?? []
  if (structuredAnswers.length > 0) {
    return structuredAnswers.join(' or ')
  }

  return analysis?.correctSolution?.trim() || ''
}

function buildResponseRecommendation(
  analysis: WhiteboardTutorResponse | null,
  analysisResult: TutorAnalysisResult | null,
  issueCard: StepCard,
  issueStep: TutorStepAnalysis | null,
  studentName: string,
): ResponseRecommendation | null {
  if (!analysis && !analysisResult) {
    return null
  }

  const studentReference = getReadableStudentReference(studentName)

  const suggestedReply = issueStep?.hint?.trim()
    || issueStep?.correction?.trim()
    || issueStep?.kidFriendlyExplanation?.trim()
    || 'What other number, besides 5, also squares to 25?'

  const summarySource = issueStep?.shortLabel?.trim() || issueCard.title
  const consequenceText = issueStep?.kidFriendlyExplanation?.trim() || issueCard.detail
  const correctionText = issueStep?.correction?.trim() || issueStep?.hint?.trim() || `Revisit ${toSentenceCase(summarySource)}.`
  const detail = [
    `First fix step ${issueCard.number}: ${toSentenceCase(summarySource)}.`,
    consequenceText,
    `Next correction: ${correctionText}`,
  ].filter(Boolean).join(' ')

  const encouragement = analysisResult?.overallSummary?.trim() || analysis?.closingEncouragement?.trim() || 'You set it up correctly. There is just one more thing to notice.'
  const conciseCorrection = issueStep?.correction?.trim() || issueStep?.kidFriendlyExplanation?.trim() || `Revisit ${toSentenceCase(summarySource)}.`

  return {
    title: `Guide ${studentReference} to fix step ${issueCard.number}.`,
    detail,
    suggestedReply,
    quickActions: [
      {
        id: 'encourage',
        label: 'Encourage progress',
        hint: 'Keep confidence high before redirecting.',
        message: encouragement,
      },
      {
        id: 'guide-root',
        label: 'Ask a guiding question',
        hint: 'Use the shortest prompt that keeps the student thinking.',
        message: suggestedReply,
      },
      {
        id: 'return-step',
        label: `Point to step ${issueCard.number}`,
        hint: `Refocus on ${toSentenceCase(issueCard.title)}.`,
        message: `Check step ${issueCard.number} again and focus on ${toSentenceCase(issueCard.title)}.`,
      },
      {
        id: 'fallback',
        label: 'Give the concise correction',
        hint: 'Use this only if the student stays stuck.',
        message: conciseCorrection,
      },
    ],
  }
}

function buildTutorAssistActionCards(
  analysis: WhiteboardTutorResponse | null,
  analysisResult: TutorAnalysisResult | null,
  issueCard: StepCard,
  issueStep: TutorStepAnalysis | null,
  answerPairText: string,
): TutorAssistActionCard[] {
  if (!analysis && !analysisResult) {
    return []
  }

  const coachingMove = issueStep?.hint?.trim() || issueStep?.kidFriendlyExplanation?.trim() || 'Ask one short guiding question before explaining the full correction.'
  const fallbackExplanation = issueStep?.correction?.trim()
    || issueStep?.kidFriendlyExplanation?.trim()
    || `Show how the corrected work leads to ${answerPairText}.`
  const confidencePhrase = analysisResult?.overallSummary?.trim()
    || analysis?.closingEncouragement?.trim()
    || 'You have the right setup. There is just one detail to fix.'

  return [
    {
      id: 'coaching',
      title: 'Best coaching move',
      recommendation: coachingMove,
      rationale: `This keeps the tutor focused on the first blocking mistake at step ${issueCard.number} before giving away the full correction.`,
      composerText: coachingMove,
    },
    {
      id: 'board',
      title: 'Best annotate-on-board move',
      recommendation: `Mark step ${issueCard.number}, then annotate ${toSentenceCase(issueCard.title)} so the first blocking mistake is visible on the board.`,
      rationale: `A quick board cue keeps the tutor focused on the earliest blocking step instead of later downstream work.`,
    },
    {
      id: 'fallback',
      title: 'Best fallback explanation',
      recommendation: fallbackExplanation,
      rationale: `Use the direct explanation only if the student stays stuck after the guiding move. It compresses the correction into one tutor-facing response.`,
      composerText: fallbackExplanation,
    },
    {
      id: 'encouragement',
      title: 'Confidence phrase',
      recommendation: confidencePhrase,
      rationale: 'Keep the redirect warm so the student stays engaged while you correct the mistake.',
      composerText: confidencePhrase,
      optional: true,
    },
  ]
}

function getStepCard(stepCards: StepCard[], stepNumber: number): StepCard {
  return stepCards.find((step) => step.number === stepNumber)
    ?? stepCards[stepNumber - 1]
    ?? { number: stepNumber, title: `Step ${stepNumber}`, detail: '' }
}

function getLikelyIssueSummary(issue: StepCard, keyStep: StepCard): string {
  if (/negative root/i.test(issue.detail)) {
    return `Student missed the negative square root at step ${keyStep.number}.`
  }

  return issue.detail || `Step ${issue.number} needs the first correction.`
}

function createBoardActionContext(stepCards: StepCard[], stepNumber: number, mode: BoardActionMode, source: BoardActionSource): BoardActionContext {
  const step = getStepCard(stepCards, stepNumber)
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

function resolveVisibleTab(tab?: TabType): VisibleTabId {
  if (tab === 'steps') return 'steps'
  if (tab === 'ai-tutor' || tab === 'help-request') return 'ai-tutor'
  return 'chat'
}

type WorkflowStep = {
  id: string
  number: number
  title: string
  detail: string
  status?: TutorStepStatus | 'neutral'
  studentText?: string
  correction?: string
  hint?: string
  explanation?: string
  tag?: StepCard['tag']
}

type NextMovePlaybook = {
  ask: string
  hint: string
  explain: string
  checkUnderstanding: string
}

const SAMPLE_STEP_CARDS: StepCard[] = [
  {
    number: 1,
    title: 'Add 3 to both sides',
    detail: 'Move the constant first so the square-root step is easier to isolate.',
  },
  {
    number: 2,
    title: 'Take the square root of both sides',
    detail: 'Student wrote √(25) = +5 only - missed the negative root',
    tag: 'KEY STEP',
  },
  {
    number: 3,
    title: 'Split into both cases',
    detail: 'The student is likely treating the square root as a single positive value and missing the second case.',
    tag: 'STUDENT ERROR',
  },
]

const PRIMARY_KEY_STEP: StepCard = SAMPLE_STEP_CARDS[1] ?? {
  number: 2,
  title: 'Take the square root of both sides',
  detail: 'Student wrote √(25) = +5 only - missed the negative root',
  tag: 'KEY STEP',
}

function isCoachingStatus(status?: TutorStepStatus | 'neutral'): boolean {
  return status === 'incorrect' || status === 'partial' || status === 'warning'
}

function getWorkflowSteps(
  analysis: WhiteboardTutorResponse | null,
  analysisResult?: TutorAnalysisResult | null,
): WorkflowStep[] {
  const structuredSteps = analysisResult?.steps ?? analysis?.analysisResult?.steps ?? []

  if (structuredSteps.length > 0) {
    const highlightedStepId = structuredSteps.find((step) => isCoachingStatus(step.status))?.id

    return structuredSteps.map((step, index) => ({
      id: step.id || `analysis-step-${index + 1}`,
      number: index + 1,
      title: step.shortLabel?.trim() || `Step ${index + 1}`,
      detail: step.kidFriendlyExplanation?.trim() || step.correction?.trim() || step.hint?.trim() || step.studentText?.trim() || 'Review this step.',
      status: step.status,
      studentText: step.studentText?.trim() || '',
      correction: step.correction?.trim() || '',
      hint: step.hint?.trim() || '',
      explanation: step.kidFriendlyExplanation?.trim() || '',
      tag: step.id === highlightedStepId ? 'STUDENT ERROR' : undefined,
    }))
  }

  return SAMPLE_STEP_CARDS.map((step) => ({
    id: `sample-step-${step.number}`,
    number: step.number,
    title: step.title,
    detail: step.detail,
    status: step.tag === 'STUDENT ERROR' ? 'incorrect' : step.tag === 'KEY STEP' ? 'partial' : 'neutral',
    studentText: step.detail,
    correction: step.detail,
    hint: step.tag === 'KEY STEP' ? 'Pause on this transition before revealing the answer.' : '',
    explanation: step.detail,
    tag: step.tag,
  }))
}

function getCurrentWorkflowStep(steps: WorkflowStep[]): WorkflowStep {
  return steps.find((step) => isCoachingStatus(step.status)) ?? steps[0] ?? {
    id: 'fallback-step',
    number: PRIMARY_KEY_STEP.number,
    title: PRIMARY_KEY_STEP.title,
    detail: PRIMARY_KEY_STEP.detail,
    status: 'partial',
    studentText: PRIMARY_KEY_STEP.detail,
    correction: PRIMARY_KEY_STEP.detail,
    hint: 'Guide the student back to this step first.',
    explanation: PRIMARY_KEY_STEP.detail,
    tag: 'KEY STEP',
  }
}

function getSolutionText(
  analysis: WhiteboardTutorResponse | null,
  analysisResult?: TutorAnalysisResult | null,
): string {
  const answers = analysisResult?.finalAnswers ?? analysis?.analysisResult?.finalAnswers ?? []
  if (answers.length > 0) {
    return answers.join(' or ')
  }

  if (analysis?.correctSolution?.trim()) {
    return analysis.correctSolution.trim()
  }

  return 'x = 2 or x = -8'
}

function extractFirstSentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/)
  return (match?.[1] ?? trimmed).trim()
}

function hasMissingDualCaseSignal(values: string[]): boolean {
  const joined = values.join(' ').toLowerCase()
  return /square root|sqrt|\+\-|±|negative root|both roots|second answer/.test(joined)
}

function getLikelyMisconception(
  analysis: WhiteboardTutorResponse | null,
  analysisResult: TutorAnalysisResult | null | undefined,
  currentStep: WorkflowStep,
): string {
  const candidateTexts = [
    currentStep.correction ?? '',
    currentStep.hint ?? '',
    currentStep.explanation ?? '',
    analysis?.sections?.errorsFound ?? '',
    analysisResult?.overallSummary ?? '',
  ].filter(Boolean)

  if (hasMissingDualCaseSignal(candidateTexts)) {
    return 'The student is likely treating the square root as a single positive value and missing the second case.'
  }

  const firstSentence = candidateTexts.map(extractFirstSentence).find(Boolean)
  if (firstSentence) {
    return firstSentence
  }

  return `The student is likely stuck on ${currentStep.title.toLowerCase()} and needs help reconnecting the rule to this step.`
}

function buildNextMovePlaybook(
  analysis: WhiteboardTutorResponse | null,
  analysisResult: TutorAnalysisResult | null | undefined,
  currentStep: WorkflowStep,
): NextMovePlaybook {
  const contextTexts = [
    currentStep.title,
    currentStep.detail,
    currentStep.correction ?? '',
    currentStep.hint ?? '',
    analysis?.sections?.errorsFound ?? '',
    analysisResult?.overallSummary ?? '',
  ]

  if (hasMissingDualCaseSignal(contextTexts)) {
    return {
      ask: 'What two numbers square to 25?',
      hint: 'Think of all values whose square is 25.',
      explain: 'When you take the square root of both sides, you must consider both +5 and -5.',
      checkUnderstanding: 'If one case is x + 3 = 5, what is the other case?',
    }
  }

  return {
    ask: currentStep.hint || `What should happen at ${currentStep.title.toLowerCase()} before you move on?`,
    hint: currentStep.explanation || currentStep.detail,
    explain: currentStep.correction || analysisResult?.overallSummary || analysis?.sections?.stepsAnalysis || 'Reveal the rule only after the student commits to a next step.',
    checkUnderstanding: `Ask the student to explain ${currentStep.title.toLowerCase()} in their own words before you confirm it.`,
  }
}

function getSessionBadgeClass(sessionState?: 'queued' | 'live' | 'async'): string {
  if (sessionState === 'live') return 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100'
  if (sessionState === 'async') return 'border-sky-400/25 bg-sky-500/10 text-sky-100'
  return 'border-amber-400/30 bg-amber-500/12 text-amber-100'
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
  viewerMode = 'tutor',
  recommendation = null,
  focusStepNumber = 1,
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
  viewerMode?: 'student' | 'tutor'
  recommendation?: ResponseRecommendation | null
  focusStepNumber?: number
}): React.JSX.Element {
  const threadRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useAutoResizeTextarea(composerValue)
  const studentInitials = useMemo(() => buildStudentInitials(studentName), [studentName])
  const visibleMessages = variant === 'workflow' ? messages.slice(-2) : messages
  const isTutorView = viewerMode === 'tutor'
  const participantLabel = studentName || (isTutorView ? 'Student' : 'Tutor')
  const boardFocusPrompt = boardActionContext ? `Let's look at step ${boardActionContext.stepNumber} together.` : ''
  const responseSectionTitle = boardActionContext && isTutorView
    ? `Send response about step ${boardActionContext.stepNumber}`
    : isTutorView
      ? 'Send response'
      : 'Send message'

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
    onBoardAction(focusStepNumber, 'annotate', 'response')
  }

  if (variant === 'workflow') {
    return (
      <div className="bg-transparent px-4 pb-4 pt-1">
        {recommendation ? (
          <>
            <div className="rounded-[14px] border border-sky-400/20 bg-[linear-gradient(180deg,rgba(30,58,95,0.34),rgba(17,24,39,0.92))] px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-200/80">Recommended next move</div>
                  <div className="mt-1 text-[15px] font-semibold text-[#F9FAFB]">{recommendation.title}</div>
                  <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">{recommendation.detail}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1F2937] text-[12px] font-semibold text-[#F9FAFB]">
                  {studentInitials}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleChipClick(recommendation.suggestedReply)}
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
                {recommendation.quickActions.map((action) => (
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
                  onClick={() => onBoardAction(focusStepNumber, 'mark', 'response')}
                  aria-pressed={isBoardActionActive(boardActionContext, 'response', 'mark', focusStepNumber)}
                  className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                    isBoardActionActive(boardActionContext, 'response', 'mark', focusStepNumber)
                      ? 'border-amber-300/60 bg-amber-500/20 text-amber-50 shadow-[0_0_0_1px_rgba(252,211,77,0.25),0_16px_30px_rgba(245,158,11,0.12)]'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/15'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Mark key step on board
                </button>
                <button
                  type="button"
                  onClick={handleAnnotateIssue}
                  aria-pressed={isBoardActionActive(boardActionContext, 'response', 'annotate', focusStepNumber)}
                  className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-medium transition ${
                    isBoardActionActive(boardActionContext, 'response', 'annotate', focusStepNumber)
                      ? 'border-sky-300/50 bg-sky-500/14 text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_16px_30px_rgba(14,165,233,0.1)]'
                      : 'border-white/10 bg-white/[0.03] text-[#D1D5DB] hover:border-white/20 hover:text-[#F9FAFB]'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Annotate issue
                </button>
              </div>
              <div className="mt-2 text-[11px] text-[#6B7280]">You can message, mark the board, or do both before opening full detail.</div>
            </div>
          </>
        ) : (
          <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.18)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Response guidance</div>
            <div className="mt-1 text-[14px] font-semibold text-[#F9FAFB]">Run tutoring help once to generate guidance from the current board.</div>
            <p className="mt-2 text-[13px] leading-6 text-[#9CA3AF]">Use the Run AI action in Diagnosis to gather the steps, response guidance, and assist recommendations in one pass.</p>
          </div>
        )}

        <div className="mt-3 rounded-[14px] border border-white/10 bg-[#161f2d] p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">{responseSectionTitle}</div>
          {boardActionContext ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-50 shadow-[0_14px_28px_rgba(245,158,11,0.08)]" aria-live="polite">
              <span className="rounded-full border border-amber-300/25 bg-amber-500/14 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-50">Active step on board</span>
              <span>{boardActionContext.statusText}</span>
              <span className="text-amber-100/80">{boardActionContext.stepTitle}</span>
              <button
                type="button"
                onClick={() => onApplyComposerText(boardFocusPrompt, 'replace')}
                className="ml-auto rounded-[8px] border border-amber-300/30 px-2 py-1 text-[11px] font-semibold text-amber-50 outline-none transition hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-amber-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#161f2d]"
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
              className="min-h-[42px] flex-1 resize-none rounded-[10px] border border-[#374151] bg-[#111827] px-3 py-2 text-[14px] text-[#F9FAFB] outline-none placeholder:text-[#6B7280] focus:border-[#F59E0B] focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#161f2d]"
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
          <div className="mt-2 text-[11px] text-[#4B5563]">Shared with both sides of the session.</div>
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
                      {isTutor ? 'You' : participantLabel}
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
          <div className="truncate text-[14px] font-medium text-[#F9FAFB]">{participantLabel}</div>
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
                    {(isTutorView ? isTutor : !isTutor) ? 'You' : participantLabel}
                  </div>
                  <div
                    className={`max-w-[85%] px-3 py-2 text-[14px] leading-6 text-[#F9FAFB] ${
                      (isTutorView ? isTutor : !isTutor)
                        ? 'rounded-[12px_12px_2px_12px] border border-[#374151] bg-[#1F2937]'
                        : `rounded-[12px_12px_12px_2px] bg-[#374151] ${message.unread ? 'border-l-2 border-l-[#3B82F6] pl-[10px]' : ''}`
                    }`}
                  >
                    {message.body}
                  </div>
                  <div className={`mt-1 text-[11px] ${(isTutorView ? isTutor : !isTutor) ? 'text-right' : 'text-left'} text-[#4B5563]`}>
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
          {isTutorView ? 'Student is offline - they\'ll see your message when they return' : `${participantLabel} is offline - they\'ll see your message when they return`}
        </div>
      ) : null}

      {isTutorView ? (
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
      ) : null}

      <div className="shrink-0 border-t border-[#374151] bg-[#1F2937] p-3">
        {boardActionContext ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[8px] border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-50">
            <span className="font-semibold">{isTutorView ? 'Board focus:' : 'Shared board focus:'}</span>
            <span>{boardActionContext.statusText}</span>
            <span className="text-amber-100/80">{boardActionContext.stepTitle}</span>
            <button
              type="button"
              onClick={() => onApplyComposerText(boardFocusPrompt, 'replace')}
              className="ml-auto rounded-[8px] border border-amber-300/30 px-2 py-1 text-[11px] font-semibold text-amber-50 outline-none transition hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-amber-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#161f2d]"
            >
              {isTutorView ? boardActionContext.responsePrompt : `Ask about step ${boardActionContext.stepNumber}`}
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
            placeholder={isTutorView ? 'Message student...' : 'Message your tutor...'}
            aria-label={isTutorView ? 'Message student' : 'Message your tutor'}
            className="min-h-[42px] flex-1 resize-none rounded-[8px] border border-[#374151] bg-[#111827] px-3 py-2 text-[14px] text-[#F9FAFB] outline-none placeholder:text-[#6B7280] focus:border-[#F59E0B] focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1F2937]"
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
        <div className="mt-2 text-[11px] text-[#4B5563]">Shared with both sides of the session.</div>
      </div>
    </div>
  )
}

function StudentPanel({
  messages,
  composerValue,
  onComposerValueChange,
  onApplyComposerText,
  onSendMessage,
  boardActionContext,
  studentName,
  studentPresence,
  studentLastSeenText,
}: {
  messages: TutorMessage[]
  composerValue: string
  onComposerValueChange: (value: string) => void
  onApplyComposerText: (text: string, mode?: 'append' | 'replace') => void
  onSendMessage: () => void
  boardActionContext: BoardActionContext | null
  studentName: string
  studentPresence: 'online' | 'offline'
  studentLastSeenText: string
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111827] p-4">
      <div className="mb-4 rounded-[16px] border border-sky-400/20 bg-[linear-gradient(180deg,rgba(18,44,72,0.55),rgba(17,24,39,0.96))] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.2)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-200/80">Session chat</div>
        <div className="mt-1 text-[15px] font-semibold text-[#F9FAFB]">Stay in sync with {studentName} while you work through the problem.</div>
        <p className="mt-2 text-[13px] leading-6 text-[#CBD5E1]">Ask follow-up questions, respond to guidance, and keep your work moving without leaving the board.</p>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[#9CA3AF]">
          <span className={`h-2 w-2 rounded-full ${studentPresence === 'online' ? 'bg-[#10B981]' : 'bg-[#6B7280]'}`} aria-hidden="true" />
          <span>{studentPresence === 'online' ? 'Online now' : studentLastSeenText}</span>
        </div>
      </div>

      {boardActionContext ? (
        <div className="mb-4 rounded-[14px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-50">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100/80">Board focus</div>
          <div className="mt-1 font-semibold">{boardActionContext.statusText}</div>
          <div className="mt-1 text-amber-100/85">{boardActionContext.stepTitle}</div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-[16px] border border-white/10 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
        <ChatPanel
          messages={messages}
          composerValue={composerValue}
          onComposerValueChange={onComposerValueChange}
          onApplyComposerText={onApplyComposerText}
          onSendMessage={onSendMessage}
          boardActionContext={boardActionContext}
          onBoardAction={() => undefined}
          studentName={studentName}
          studentPresence={studentPresence}
          studentLastSeenText={studentLastSeenText}
          viewerMode="student"
        />
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
  onRetryAnalysis,
  analysisLoading,
  analysisPendingConfirmation = false,
  analysisSourceLabel,
  stepCards,
  primaryDiagnosisIssue,
  primaryKeyStep,
  problemText,
  answerPairText,
  variant = 'detail',
}: {
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  onRetryAnalysis: () => void
  analysisLoading: boolean
  analysisPendingConfirmation?: boolean
  analysisSourceLabel: string | null
  stepCards: StepCard[]
  primaryDiagnosisIssue: StepCard
  primaryKeyStep: StepCard
  problemText: string
  answerPairText: string
  variant?: PanelVariant
}): React.JSX.Element {
  const focusStep = primaryDiagnosisIssue

  if (variant === 'workflow') {
    return (
      <div className="space-y-4 pb-1">
        <section className="rounded-[14px] border border-amber-400/25 bg-[linear-gradient(180deg,rgba(120,53,15,0.28),rgba(17,24,39,0.92))] px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.2)]">
          <div className="text-[10px] uppercase tracking-[0.08em] text-amber-200/80">Likely issue</div>
          <div className="mt-1 text-[16px] font-semibold text-[#F9FAFB]">Likely issue: {getLikelyIssueSummary(primaryDiagnosisIssue, primaryKeyStep)}</div>
          <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">{primaryDiagnosisIssue.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#7c2d12] bg-[#451a03] px-3 py-1 text-[11px] font-semibold text-amber-100">
              Focus step {focusStep.number}: {focusStep.title}
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
              Answer pair: {answerPairText}
            </span>
            {analysisSourceLabel ? (
              <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200">
                {analysisSourceLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              title="Mark this step on the whiteboard"
              aria-pressed={isBoardActionActive(boardActionContext, 'diagnosis', 'mark', focusStep.number)}
              className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                isBoardActionActive(boardActionContext, 'diagnosis', 'mark', focusStep.number)
                  ? 'border-amber-300/60 bg-amber-500/20 text-amber-50 shadow-[0_0_0_1px_rgba(252,211,77,0.25),0_16px_30px_rgba(245,158,11,0.12)]'
                  : 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/15'
              }`}
              onClick={() => onBoardAction(focusStep.number, 'mark', 'diagnosis')}
            >
              <MapPin className="h-3.5 w-3.5" />
              Mark blocking step on board
            </button>
            <div className="inline-flex items-center rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-[#9CA3AF]">
              First tutoring move: fix step {focusStep.number} before discussing later work.
            </div>
            <button
              type="button"
              onClick={onRetryAnalysis}
              disabled={analysisLoading || analysisPendingConfirmation}
              className="inline-flex items-center rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {analysisLoading ? 'Refreshing…' : analysisPendingConfirmation ? 'Confirming…' : 'Refresh diagnosis'}
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#8f867d]">Problem</div>
              <div className="mt-1 text-[14px] font-medium text-[#F9FAFB]">{problemText}</div>
            </div>
            <div className="text-[11px] text-[#6B7280]">Supporting steps</div>
          </div>

          <div className="mt-3 space-y-2">
            {stepCards.map((step) => (
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
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-[13px] font-medium text-[#F9FAFB]">{step.title}</h3>
                        {boardActionContext?.stepNumber === step.number ? (
                          <span className="rounded-full border border-amber-300/25 bg-amber-500/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                            Focused on board
                          </span>
                        ) : null}
                      </div>
                      <StepTag value={step.tag} />
                    </div>
                    <p className="mt-1 text-[12px] text-[#9CA3AF]">{step.detail}</p>
                    {step.tag || boardActionContext?.stepNumber === step.number ? (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          title="Mark this step on the whiteboard"
                          aria-pressed={isBoardActionActive(boardActionContext, 'diagnosis', 'mark', step.number)}
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
                    ) : null}
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[#6B7280]">PROBLEM</div>
            <div className="mt-1 text-[15px] font-medium text-[#F9FAFB]">{problemText}</div>
          </div>
          <button
            type="button"
            onClick={onRetryAnalysis}
            disabled={analysisLoading || analysisPendingConfirmation}
            className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analysisLoading ? 'Refreshing…' : analysisPendingConfirmation ? 'Confirming…' : 'Refresh diagnosis'}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <div className="inline-flex rounded-full bg-[#064E3B] px-[10px] py-[2px] text-[12px] text-[#10B981]">
            {answerPairText}
          </div>
          {analysisSourceLabel ? (
            <div className="inline-flex rounded-full border border-sky-400/20 bg-sky-500/10 px-[10px] py-[2px] text-[12px] text-sky-200">
              {analysisSourceLabel}
            </div>
          ) : null}
        </div>
      </section>

      {stepCards.map((step) => (
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
              {step.tag || boardActionContext?.stepNumber === step.number ? (
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
              ) : null}
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
  onStartAnalysis,
  onRetryAnalysis,
  analysisLoading,
  analysisPendingConfirmation = false,
  analysisSourceLabel,
  stepCards,
  primaryDiagnosisIssue,
  primaryKeyStep,
  problemText,
  answerPairText,
  variant = 'detail',
}: {
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  onStartAnalysis: () => void
  onRetryAnalysis: () => void
  analysisLoading: boolean
  analysisPendingConfirmation?: boolean
  analysisSourceLabel: string | null
  stepCards: StepCard[]
  primaryDiagnosisIssue: StepCard
  primaryKeyStep: StepCard
  problemText: string
  answerPairText: string
  variant?: PanelVariant
}): React.JSX.Element {
  if (stepCards.length === 0 || !problemText.trim()) {
    return variant === 'workflow'
      ? (
          <div className="bg-transparent px-4 pb-4 pt-1">
            <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Diagnosis</div>
                  <div className="mt-1 text-[14px] font-semibold text-[#F9FAFB]">No steps yet</div>
                </div>
                <button
                  type="button"
                  onClick={onStartAnalysis}
                  disabled={analysisLoading || analysisPendingConfirmation}
                  className="shrink-0 rounded-[10px] bg-[#F59E0B] px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-[#f2ab28]"
                >
                  {analysisLoading ? 'Thinking…' : analysisPendingConfirmation ? 'Confirming…' : 'Run AI'}
                </button>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-[#9CA3AF]">Run AI analysis to generate solution steps.</p>
            </div>
          </div>
        )
      : (
          <div className="flex h-full items-center justify-center p-4 text-center">
            <div className="mx-auto flex max-w-[320px] flex-col items-center gap-4 rounded-[16px] border border-white/10 bg-white/[0.03] px-5 py-6 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
              <List className="h-10 w-10 text-[#6B7280]" strokeWidth={1.75} aria-hidden="true" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-[#F9FAFB]">No steps yet</h3>
                <p className="text-sm leading-6 text-[#6B7280]">Run AI analysis to generate solution steps.</p>
              </div>
              <button
                type="button"
                onClick={onStartAnalysis}
                disabled={analysisLoading || analysisPendingConfirmation}
                className="rounded-[10px] bg-[#F59E0B] px-4 py-2 text-[13px] font-semibold text-black transition hover:bg-[#f2ab28]"
              >
                {analysisLoading ? 'Thinking…' : analysisPendingConfirmation ? 'Confirming…' : 'Run AI analysis'}
              </button>
            </div>
          </div>
        )
  }

  if (variant === 'workflow') {
    return (
      <div className="bg-transparent px-4 pb-4 pt-1">
        <StepStatePopulated
          boardActionContext={boardActionContext}
          onBoardAction={onBoardAction}
          onRetryAnalysis={onRetryAnalysis}
          analysisLoading={analysisLoading}
          analysisPendingConfirmation={analysisPendingConfirmation}
          analysisSourceLabel={analysisSourceLabel}
          stepCards={stepCards}
          primaryDiagnosisIssue={primaryDiagnosisIssue}
          primaryKeyStep={primaryKeyStep}
          problemText={problemText}
          answerPairText={answerPairText}
          variant="workflow"
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111827] p-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StepStatePopulated
          boardActionContext={boardActionContext}
          onBoardAction={onBoardAction}
          onRetryAnalysis={onRetryAnalysis}
          analysisLoading={analysisLoading}
          analysisPendingConfirmation={analysisPendingConfirmation}
          analysisSourceLabel={analysisSourceLabel}
          stepCards={stepCards}
          primaryDiagnosisIssue={primaryDiagnosisIssue}
          primaryKeyStep={primaryKeyStep}
          problemText={problemText}
          answerPairText={answerPairText}
          variant="detail"
        />
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
  actionCards,
  focusStepNumber,
  variant = 'detail',
}: {
  privateNotes: string
  onPrivateNotesChange: (value: string) => void
  onRerun: () => void
  onUseReply: (value: string) => void
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  actionCards: TutorAssistActionCard[]
  focusStepNumber: number
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
    onBoardAction(focusStepNumber, 'annotate', 'assist')
  }

  return (
    <div className={`space-y-3 ${variant === 'detail' ? 'pb-4' : ''}`}>
      {variant === 'workflow' ? (
        <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Fast coaching backup</div>
          <div className="mt-1 text-[13px] leading-6 text-[#9CA3AF]">Use Assist when you need one sharp move, one board cue, or one fallback explanation.</div>
        </div>
      ) : null}

      {actionCards.map((card) => (
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
                  onClick={() => onBoardAction(focusStepNumber, 'mark', 'assist')}
                    aria-pressed={isBoardActionActive(boardActionContext, 'assist', 'mark', focusStepNumber)}
                  className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                    isBoardActionActive(boardActionContext, 'assist', 'mark', focusStepNumber)
                      ? 'border-amber-300/60 bg-amber-500/20 text-amber-50 shadow-[0_0_0_1px_rgba(252,211,77,0.25),0_16px_30px_rgba(245,158,11,0.12)]'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/15'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Mark key step on board
                </button>
                <button
                  type="button"
                  onClick={handleAnnotateIssue}
                  aria-pressed={isBoardActionActive(boardActionContext, 'assist', 'annotate', focusStepNumber)}
                  className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-medium transition ${
                    isBoardActionActive(boardActionContext, 'assist', 'annotate', focusStepNumber)
                      ? 'border-sky-300/50 bg-sky-500/14 text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_16px_30px_rgba(14,165,233,0.1)]'
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
  actionCards,
  focusStepNumber,
  variant = 'detail',
  onUseReply,
  boardActionContext,
  onBoardAction,
}: {
  initialState?: TutorAssistViewState
  analysisLoading: boolean
  onStartAnalysis: () => void
  actionCards: TutorAssistActionCard[]
  focusStepNumber: number
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
            actionCards={actionCards}
            focusStepNumber={focusStepNumber}
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
            actionCards={actionCards}
            focusStepNumber={focusStepNumber}
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

function TutorWorkflowOverview({
  analysis,
  analysisResult,
  boardActionContext,
  onBoardAction,
  onUseReply,
  onOpenDetail,
  sessionState,
  sessionBadgeText,
  sessionSummaryText,
  sessionMetaText,
  sessionSubjectText,
  sessionGradeText,
  onPickUpSession,
  onPassSession,
}: {
  analysis: WhiteboardTutorResponse | null
  analysisResult?: TutorAnalysisResult | null
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  onUseReply: (value: string) => void
  onOpenDetail: (tabId: VisibleTabId) => void
  sessionState?: 'queued' | 'live' | 'async'
  sessionBadgeText?: string
  sessionSummaryText?: string
  sessionMetaText?: string | null
  sessionSubjectText?: string | null
  sessionGradeText?: string | null
  onPickUpSession?: () => void
  onPassSession?: () => void
}): React.JSX.Element {
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [explanationOpen, setExplanationOpen] = useState(false)
  const [solutionOpen, setSolutionOpen] = useState(false)
  const steps = useMemo(() => getWorkflowSteps(analysis, analysisResult), [analysis, analysisResult])
  const currentStep = useMemo(() => getCurrentWorkflowStep(steps), [steps])
  const misconception = useMemo(() => getLikelyMisconception(analysis, analysisResult, currentStep), [analysis, analysisResult, currentStep])
  const playbook = useMemo(() => buildNextMovePlaybook(analysis, analysisResult, currentStep), [analysis, analysisResult, currentStep])
  const solutionText = useMemo(() => getSolutionText(analysis, analysisResult), [analysis, analysisResult])
  const detailedExplanation = analysisResult?.overallSummary?.trim() || analysis?.sections?.stepsAnalysis?.trim() || currentStep.explanation || currentStep.detail
  const evidenceText = currentStep.studentText || analysis?.sections?.errorsFound?.trim() || currentStep.detail
  const hasSessionSummary = Boolean(sessionBadgeText || sessionSummaryText || sessionMetaText || sessionSubjectText || sessionGradeText || onPickUpSession || onPassSession)

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-4 pb-6">
        {hasSessionSummary ? (
          <section className="rounded-[16px] border border-white/10 bg-white/[0.02] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Session summary</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {sessionBadgeText ? (
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getSessionBadgeClass(sessionState)}`}>
                      {sessionBadgeText}
                    </span>
                  ) : null}
                  {sessionSubjectText ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#D1D5DB]">{sessionSubjectText}</span> : null}
                  {sessionGradeText ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#D1D5DB]">{sessionGradeText}</span> : null}
                </div>
                {sessionSummaryText ? <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">{sessionSummaryText}</p> : null}
                {sessionMetaText ? <p className="mt-1 text-[12px] text-[#8f867d]">{sessionMetaText}</p> : null}
              </div>

              {sessionState === 'queued' && (onPickUpSession || onPassSession) ? (
                <div className="flex shrink-0 items-center gap-2">
                  {onPickUpSession ? (
                    <button
                      type="button"
                      onClick={onPickUpSession}
                      className="rounded-[10px] bg-[#F59E0B] px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-[#f2ab28]"
                    >
                      Pick Up Session
                    </button>
                  ) : null}
                  {onPassSession ? (
                    <button
                      type="button"
                      onClick={onPassSession}
                      className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                    >
                      Pass
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(36,28,20,0.88),rgba(17,24,39,0.98))] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-200/85">Likely misconception</div>
              <h2 className="mt-2 text-[18px] font-semibold leading-tight text-[#F9FAFB]">{misconception}</h2>
              <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">Current board focus: {currentStep.title}.</p>
            </div>
            {currentStep.tag ? <StepTag value={currentStep.tag} /> : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onBoardAction(currentStep.number, 'mark', 'diagnosis')}
              aria-pressed={isBoardActionActive(boardActionContext, 'diagnosis', 'mark', currentStep.number)}
              className={`inline-flex items-center gap-2 rounded-[12px] border px-3 py-2 text-[13px] font-semibold transition ${
                isBoardActionActive(boardActionContext, 'diagnosis', 'mark', currentStep.number)
                  ? 'border-amber-300/60 bg-amber-500/20 text-amber-50 shadow-[0_0_0_1px_rgba(252,211,77,0.25),0_16px_30px_rgba(245,158,11,0.12)]'
                  : 'border-amber-400/25 bg-amber-500/12 text-amber-100 hover:border-amber-400/40 hover:bg-amber-500/16'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Focus board here
            </button>
            <span className="text-[12px] text-[#9CA3AF]">One clear board move first. Deeper evidence stays below.</span>
          </div>
        </section>

        <section className="rounded-[18px] border border-sky-400/18 bg-[linear-gradient(180deg,rgba(23,36,56,0.92),rgba(17,24,39,0.98))] px-4 py-4 shadow-[0_22px_40px_rgba(0,0,0,0.24)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-200/80">Best next move</div>
              <h2 className="mt-2 text-[20px] font-semibold text-[#F9FAFB]">What to say next</h2>
            </div>
            <button
              type="button"
              onClick={() => onUseReply(playbook.ask)}
              className="shrink-0 rounded-[12px] bg-[#F59E0B] px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-[#f2ab28]"
            >
              Use first response
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {[
              ['Ask', playbook.ask],
              ['Hint', playbook.hint],
              ['Explain', playbook.explain],
              ['Check understanding', playbook.checkUnderstanding],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">{label}</div>
                <p className="mt-1 text-[14px] leading-6 text-[#F9FAFB]">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setDetailsOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={detailsOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Supporting steps</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Keep the active step visually distinct and the rest subordinate.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${detailsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {detailsOpen ? (
            <div className="border-t border-white/10 px-4 py-3">
              <div className="space-y-2">
                {steps.map((step) => {
                  const isActive = step.number === currentStep.number
                  return (
                    <article key={step.id} className={`rounded-[12px] border px-3 py-3 ${isActive ? 'border-amber-300/30 bg-amber-500/[0.08]' : 'border-white/8 bg-white/[0.02]'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isActive ? 'bg-[#78350F] text-[#F59E0B]' : 'bg-[#1F2937] text-[#9CA3AF]'}`}>
                          {step.number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className={`text-[13px] font-medium ${isActive ? 'text-[#F9FAFB]' : 'text-[#D1D5DB]'}`}>{step.title}</h3>
                            {isActive ? <span className="rounded-full border border-amber-300/25 bg-amber-500/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100">Current focus</span> : null}
                          </div>
                          <p className={`mt-1 text-[12px] leading-5 ${isActive ? 'text-[#D1D5DB]' : 'text-[#8f867d]'}`}>{step.detail}</p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setEvidenceOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={evidenceOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Evidence from student work</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Keep the raw clue available, but not competing with the next move.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${evidenceOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {evidenceOpen ? <div className="border-t border-white/10 px-4 py-3 text-[13px] leading-6 text-[#D1D5DB]">{evidenceText}</div> : null}
        </section>

        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setSolutionOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={solutionOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Reveal solution</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Keep the answer pair demoted until the tutor actually needs it.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${solutionOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {solutionOpen ? <div className="border-t border-white/10 px-4 py-3 text-[15px] font-semibold text-[#F9FAFB]">{solutionText}</div> : null}
        </section>

        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setExplanationOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={explanationOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Detailed explanation</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Full rationale stays tucked behind disclosure instead of filling the top of the rail.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${explanationOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {explanationOpen ? <div className="border-t border-white/10 px-4 py-3 text-[13px] leading-6 text-[#D1D5DB]">{detailedExplanation}</div> : null}
        </section>

        <div className="flex flex-wrap gap-2 px-1">
          <button type="button" onClick={() => onOpenDetail('chat')} className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]">
            Open conversation
          </button>
          <button type="button" onClick={() => onOpenDetail('steps')} className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]">
            Open full steps
          </button>
          <button type="button" onClick={() => onOpenDetail('ai-tutor')} className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]">
            Open assist detail
          </button>
        </div>
      </div>
    </div>
  )
}

const RightSidePanel: React.FC<RightSidePanelProps> = ({
  className = '',
  initialTab = 'steps',
  activeTab,
  initialChatMessages,
  initialTutorAssistState,
  studentName = 'Student',
  studentPresence = 'offline',
  studentLastSeenText = 'Last seen 2 hrs ago',
  panelMode = 'tutor',
  analysis,
  analysisResult,
  analysisLoading,
  analysisPendingConfirmation = false,
  analysisError,
  onStartAnalysis,
  onRetryAnalysis,
  onMarkStep,
  onBoardActionContextChange,
  sessionState,
  sessionBadgeText,
  sessionSummaryText,
  sessionMetaText,
  sessionSubjectText,
  sessionGradeText,
  onPickUpSession,
  onPassSession,
  width = 'clamp(380px, 35vw, 560px)',
  onTabChange,
}) => {
  const requestedTab = useMemo(() => resolveVisibleTab(activeTab ?? initialTab), [activeTab, initialTab])
  const [detailTab, setDetailTab] = useState<VisibleTabId | null>(() => (requestedTab === 'steps' ? null : requestedTab))
  const [chatMessages, setChatMessages] = useState<TutorMessage[]>(() => initialChatMessages ?? [])
  const [chatComposerValue, setChatComposerValue] = useState('')
  const [boardActionContext, setBoardActionContext] = useState<BoardActionContext | null>(null)
  const [panelToastMessage, setPanelToastMessage] = useState<string | null>(null)
  const previousPresenceRef = useRef(studentPresence)
  const previousActiveTabRef = useRef<TabType | undefined>(activeTab)
  const resolvedAnalysisResult = useMemo(() => analysisResult ?? analysis?.analysisResult ?? null, [analysis, analysisResult])
  const analysisSourceLabel = useMemo(() => getAnalysisSourceLabel(analysis), [analysis])
  const stepCards = useMemo(() => buildStepCards(resolvedAnalysisResult), [resolvedAnalysisResult])
  const primaryDiagnosisIssue = useMemo(() => getPrimaryDiagnosisIssue(stepCards), [stepCards])
  const primaryKeyStep = useMemo(() => getPrimaryKeyStep(stepCards, primaryDiagnosisIssue), [stepCards, primaryDiagnosisIssue])
  const primaryIssueStep = useMemo(() => getStructuredStep(resolvedAnalysisResult, primaryDiagnosisIssue), [resolvedAnalysisResult, primaryDiagnosisIssue])
  const problemText = useMemo(() => getProblemText(analysis, resolvedAnalysisResult), [analysis, resolvedAnalysisResult])
  const answerPairText = useMemo(() => getAnswerPairText(analysis, resolvedAnalysisResult), [analysis, resolvedAnalysisResult])
  const responseRecommendation = useMemo(
    () => buildResponseRecommendation(analysis, resolvedAnalysisResult, primaryDiagnosisIssue, primaryIssueStep, studentName),
    [analysis, resolvedAnalysisResult, primaryDiagnosisIssue, primaryIssueStep, studentName],
  )
  const tutorAssistActionCards = useMemo(
    () => buildTutorAssistActionCards(analysis, resolvedAnalysisResult, primaryDiagnosisIssue, primaryIssueStep, answerPairText),
    [analysis, resolvedAnalysisResult, primaryDiagnosisIssue, primaryIssueStep, answerPairText],
  )
  const resolvedTutorAssistState = initialTutorAssistState ?? (resolvedAnalysisResult ? 'populated' : 'ready')

  useEffect(() => {
    tutorFixDebug('rendered-workflow-summary', {
      studentName,
      cacheSource: analysis?.cacheSource ?? null,
      analysisSourceLabel,
      hasStructuredAnalysis: Boolean(resolvedAnalysisResult),
      problemText,
      primaryDiagnosisIssue: {
        number: primaryDiagnosisIssue.number,
        title: primaryDiagnosisIssue.title,
        detail: primaryDiagnosisIssue.detail,
      },
      recommendedNextMove: responseRecommendation ? {
        title: responseRecommendation.title,
        detail: responseRecommendation.detail,
      } : null,
      assistCards: tutorAssistActionCards.map((card) => card.title),
    })
  }, [analysis?.cacheSource, analysisSourceLabel, problemText, primaryDiagnosisIssue, resolvedAnalysisResult, responseRecommendation, studentName, tutorAssistActionCards])

  const resolvedWidth = typeof width === 'number' ? `${Math.max(width, 380)}px` : width

  const panelStyle: React.CSSProperties = {
    width: resolvedWidth,
    minWidth: '380px',
    backgroundColor: '#111827',
    fontFamily: '"DM Sans", sans-serif',
  }

  const handleOpenDetail = (tabId: VisibleTabId) => {
    setDetailTab(tabId)
    onTabChange?.(tabId)
  }

  const handleDetailTabChange = (tabId: VisibleTabId) => {
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
      setDetailTab(nextTab === 'steps' ? null : nextTab)
    }

    previousActiveTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    setChatMessages(initialChatMessages ?? [])
  }, [initialChatMessages])

  useEffect(() => {
    onBoardActionContextChange?.(boardActionContext)
  }, [boardActionContext, onBoardActionContextChange])

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

    handleApplyComposerText(value, 'replace')

    if (detailTab === 'ai-tutor') {
      setDetailTab('chat')
      onTabChange?.('chat')
    }
  }

  const handleBoardAction = (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => {
    setBoardActionContext(createBoardActionContext(stepCards, stepNumber, mode, source))

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
          viewerMode="tutor"
          recommendation={responseRecommendation}
          focusStepNumber={primaryDiagnosisIssue.number}
        />
      )
    }

    if (tabId === 'steps') {
      return (
        <StepsPanel
          boardActionContext={boardActionContext}
          onBoardAction={handleBoardAction}
          onStartAnalysis={onStartAnalysis}
          onRetryAnalysis={onRetryAnalysis}
          analysisLoading={analysisLoading}
          analysisPendingConfirmation={analysisPendingConfirmation}
          analysisSourceLabel={analysisSourceLabel}
          stepCards={stepCards}
          primaryDiagnosisIssue={primaryDiagnosisIssue}
          primaryKeyStep={primaryKeyStep}
          problemText={problemText}
          answerPairText={answerPairText}
        />
      )
    }

    if (tabId === 'ai-tutor') {
      return (
        <TutorAssistPanel
          initialState={resolvedTutorAssistState}
          analysisLoading={analysisLoading}
          onStartAnalysis={onStartAnalysis}
          actionCards={tutorAssistActionCards}
          focusStepNumber={primaryDiagnosisIssue.number}
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

      {panelMode === 'student' ? (
        <div className="min-h-0 flex-1 overflow-hidden bg-[#111827]">
          <StudentPanel
            messages={chatMessages}
            composerValue={chatComposerValue}
            onComposerValueChange={setChatComposerValue}
            onApplyComposerText={handleApplyComposerText}
            onSendMessage={handleSendChatMessage}
            boardActionContext={boardActionContext}
            studentName={studentName}
            studentPresence={studentPresence}
            studentLastSeenText={studentLastSeenText}
          />
        </div>
      ) : (
      <>
      <div className="shrink-0 border-b border-[#374151] bg-[linear-gradient(180deg,rgba(31,41,55,0.96),rgba(17,24,39,0.98))] px-4 py-3">
        {detailTab ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Tutor workflow</div>
                <div className="mt-1 text-[14px] font-semibold text-[#F9FAFB]">Workflow detail</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailTab(null)}
                className="rounded-[8px] px-2 py-1 text-[11px] font-medium text-[#9CA3AF] outline-none transition hover:text-[#F9FAFB] focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]"
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
                    className={`rounded-[10px] border px-3 py-2 text-[12px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] ${
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

      {analysisPendingConfirmation ? (
        <div className="shrink-0 border-b border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-50" aria-live="polite">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100/80">AI request pending</div>
          <div className="mt-1 font-semibold">Confirm AI assistance to start analysis.</div>
          <div className="mt-1 text-amber-100/80">One run gathers diagnosis, response guidance, and assist recommendations for this board.</div>
        </div>
      ) : null}

      {analysisLoading ? (
        <div className="shrink-0 border-b border-sky-400/20 bg-sky-500/10 px-4 py-3 text-[13px] text-sky-50" aria-live="polite">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-100/80">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            AI thinking
          </div>
          <div className="mt-1 font-semibold">Analyzing the current board…</div>
          <div className="mt-1 text-sky-100/80">Gathering solution steps, response guidance, and assist recommendations.</div>
        </div>
      ) : null}

      {analysisError ? (
        <div className="shrink-0 border-b border-rose-400/20 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-50" role="alert">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-100/80">AI request failed</div>
              <div className="mt-1 font-semibold">Could not analyze this board.</div>
              <div className="mt-1 text-rose-100/85">{analysisError}</div>
            </div>
            <button
              type="button"
              onClick={onRetryAnalysis}
              className="shrink-0 rounded-[10px] border border-rose-200/25 bg-rose-500/10 px-3 py-2 text-[12px] font-semibold text-rose-50 transition hover:bg-rose-500/15"
            >
              Retry AI
            </button>
          </div>
        </div>
      ) : null}

      {boardActionContext ? (
        <div className="shrink-0 border-b border-white/10 bg-[linear-gradient(180deg,rgba(69,39,13,0.9),rgba(17,24,39,0.98))] px-4 py-2.5 shadow-[0_14px_28px_rgba(245,158,11,0.08)]" aria-live="polite">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100/85">
            <span className="inline-flex h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" />
            Board focus
            <span className="rounded-full border border-amber-300/25 bg-amber-500/14 px-2 py-1 text-[10px] text-amber-50">{boardActionContext.sourceText}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[13px] text-[#F9FAFB]">
            <span className="font-semibold">{boardActionContext.statusText}</span>
            <span className="text-[#d9c7a7]">{boardActionContext.stepTitle}</span>
            <button
              type="button"
              onClick={() => setBoardActionContext(null)}
              className="ml-auto rounded-[8px] px-2 py-1 text-[11px] font-medium text-[#D1D5DB] outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]"
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
          <TutorWorkflowOverview
            analysis={analysis}
            analysisResult={analysisResult}
            boardActionContext={boardActionContext}
            onBoardAction={handleBoardAction}
            onUseReply={handleUseAssistReply}
            onOpenDetail={handleOpenDetail}
            sessionState={sessionState}
            sessionBadgeText={sessionBadgeText}
            sessionSummaryText={sessionSummaryText}
            sessionMetaText={sessionMetaText}
            sessionSubjectText={sessionSubjectText}
            sessionGradeText={sessionGradeText}
            onPickUpSession={onPickUpSession}
            onPassSession={onPassSession}
          />
        )}
      </div>
      </>
      )}
    </aside>
  )
}

export default RightSidePanel
