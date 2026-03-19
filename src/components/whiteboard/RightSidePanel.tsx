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
import ChatWindow from '../chat/ChatWindow'
import type { TutorLessonMessage } from './tabs/AITutorTab'
import type { TutorAnalysisResult, TutorStepAnalysis, WhiteboardTutorResponse } from '../../types/whiteboard'
import type { TutorStepStatus } from '../../types/whiteboard'
import { readStoredTutorAssistState, writeStoredTutorAssistState } from './tutorAssistPersistence'

export type TabType = 'ai-tutor' | 'help-request' | 'chat' | 'steps'

export interface RightSidePanelProps {
  className?: string
  chatRoomId?: string | null
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
  onProblemDraftChange?: (value: string) => void
  analysis: WhiteboardTutorResponse | null
  analysisMode?: 'quick' | 'full' | null
  analysisResult?: TutorAnalysisResult | null
  analysisLoading: boolean
  analysisError: string | null
  analysisPendingConfirmation?: boolean
  onStartAnalysis: (mode: 'quick' | 'full') => void
  onRetryAnalysis: (mode: 'quick' | 'full') => void
  onUseStrongerModel?: (mode: 'quick' | 'full') => void
  responseAge: string
  responseAgeInvalid: boolean
  onResponseAgeChange: (value: string) => void
  tutorDraft: string
  tutorSubmitting: boolean
  onTutorDraftChange: (value: string) => void
  onTutorSubmit: () => void
  onRequestHumanTutor: () => void
  onLessonMessageChange?: (message: TutorLessonMessage | null) => void
  assistContextKey?: string | null
  activeTutorStepId?: string | null
  tutorWalkthroughActive?: boolean
  overlayVisible?: boolean
  tutorPlaybackCanPlay?: boolean
  tutorPlaybackIsPlaying?: boolean
  onTutorWalkthroughEnter?: () => void
  onTutorWalkthroughExit?: () => void
  onToggleTutorOverlay?: () => void
  onTutorPlaybackPlay?: () => void
  onTutorPlaybackPause?: () => void
  onTutorPlaybackPrevious?: () => void
  onTutorPlaybackNext?: () => void
  onTutorPlaybackReplay?: () => void
  onTutorStepSelect?: (stepId: string | null) => void
  onMarkStep?: (stepNumber: number) => void
  onBoardActionContextChange?: (context: BoardActionContext | null) => void
  onClearAnalysisReview?: () => void
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
type TutorAssistRequestMode = 'simple' | 'deep'

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

type TutorAssistViewState = 'ready' | 'loading' | 'simple' | 'deep'

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

type ResponseRecommendation = {
  title: string
  detail: string
  suggestedReply: string
  quickActions: TutorQuickAction[]
}

type TutorConfidenceLevel = 'high' | 'medium' | 'low'

type TutorConfidenceState = {
  level: TutorConfidenceLevel
  label: string
  detail: string
}

type TutorModelSummary = {
  label: string
  detail: string | null
  tier: 'standard' | 'stronger' | null
  strongerModelAvailable: boolean
}

type TutorAssistSummaryState = {
  diagnosis: string | null
  nextMove: string | null
  focusStep: StepCard | null
  evidenceText: string
  modelSummary: TutorModelSummary | null
  confidence: TutorConfidenceState | null
  canUseStrongerModel: boolean
}

type TutorResponseMode = 'quick' | 'full'

type TutorResponseModeCard = {
  id: TutorResponseMode
  label: string
  summary: string
  detail: string
  ctaLabel: string
  emphasisClassName: string
  buttonClassName: string
  panelClassName: string
  caution?: string
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

const QUICK_REPLY_CHIPS = ['Great effort! 👍', "You're close!", "Let's try again", 'Check step 2']

const PRIMARY_TABS: Array<{ id: VisibleTabId; title: string }> = [
  { id: 'chat', title: 'Chat' },
  { id: 'ai-tutor', title: 'AI Review' },
]

function hasVisibleText(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0
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

  return analysisResult.steps
    .map((step, index): StepCard => {
      const tag: StepCard['tag'] = index === issueIndex
        ? 'STUDENT ERROR'
        : index === keyIndex
          ? 'KEY STEP'
          : undefined

      return {
        number: index + 1,
        title: step.shortLabel?.trim() || '',
        detail: step.kidFriendlyExplanation?.trim() || step.correction?.trim() || step.hint?.trim() || '',
        tag,
      }
    })
    .filter((step) => hasVisibleText(step.title) || hasVisibleText(step.detail))
}

function getPrimaryDiagnosisIssue(stepCards: StepCard[]): StepCard | null {
  return stepCards.find((step) => step.tag === 'STUDENT ERROR') ?? stepCards[0] ?? null
}

function getStructuredStep(analysisResult: TutorAnalysisResult | null, stepCard: StepCard | null): TutorStepAnalysis | null {
  if (!stepCard) return null
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
  issueCard: StepCard | null,
  issueStep: TutorStepAnalysis | null,
): ResponseRecommendation | null {
  if (!analysis && !analysisResult) {
    return null
  }

  const suggestedReply = issueStep?.hint?.trim()
  if (!suggestedReply || !issueCard) {
    return null
  }

  const detail = issueStep?.correction?.trim() || issueStep?.kidFriendlyExplanation?.trim() || ''

  return {
    title: 'Next tutor move',
    detail,
    suggestedReply,
    quickActions: [],
  }
}

function getTutorConfidenceState(
  analysisResult: TutorAnalysisResult | null,
  issueStep: TutorStepAnalysis | null,
): TutorConfidenceState | null {
  void analysisResult
  void issueStep
  return null
}

function getTutorConfidenceBadgeClass(level: TutorConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
    case 'medium':
      return 'border-amber-400/25 bg-amber-500/10 text-amber-200'
    default:
      return 'border-slate-400/20 bg-slate-500/10 text-slate-200'
  }
}

function getTutorModelSummary(analysis: WhiteboardTutorResponse | null): TutorModelSummary | null {
  const modelMetadata = analysis?.modelMetadata
  if (!modelMetadata) {
    return null
  }

  const label = modelMetadata.evaluationModel || modelMetadata.transcriptionModel || ''
  if (!label) {
    return null
  }

  const detail = modelMetadata.transcriptionModel && modelMetadata.evaluationModel
    ? `Photo read: ${modelMetadata.transcriptionModel}`
    : null

  return {
    label,
    detail,
    tier: modelMetadata.tier,
    strongerModelAvailable: modelMetadata.strongerModelAvailable,
  }
}

function buildTutorAssistLessonMessage(summary: {
  diagnosis: string | null
  nextMove: string | null
  focusStep: StepCard | null
}): TutorLessonMessage | null {
  if (!summary.diagnosis && !summary.nextMove) {
    return null
  }

  return {
    title: summary.focusStep?.title || summary.diagnosis || 'Tutor Assist',
    body: summary.nextMove || summary.diagnosis || '',
    tone: 'assistant',
  }
}

function getStepCard(stepCards: StepCard[], stepNumber: number): StepCard {
  return stepCards.find((step) => step.number === stepNumber)
    ?? stepCards[stepNumber - 1]
    ?? { number: stepNumber, title: '', detail: '' }
}

function getLikelyIssueSummary(issue: StepCard | null): string | null {
  if (!issue) return null
  return issue.detail || issue.title || null
}

function buildEngineResponsePreview(
  analysis: WhiteboardTutorResponse | null,
  analysisResult: TutorAnalysisResult | null,
): string {
  return JSON.stringify(
    {
      analysisSource: analysis?.analysisSource ?? analysis?.analysisPipeline?.analysisSource ?? null,
      deterministicResponse: analysis?.analysisPipeline?.deterministic ?? null,
      fallbackRan: Boolean(analysis?.analysisPipeline?.fallback?.ran),
      fallbackSource: analysis?.analysisPipeline?.fallback?.source ?? null,
      guidedSolutionSource: analysisResult?.guidedSolutionMetadata?.source ?? null,
      observedSteps: analysisResult?.observedSteps ?? [],
      guidedSolutionSteps: analysisResult?.guidedSolutionSteps ?? [],
    },
    null,
    2,
  )
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

    return structuredSteps
      .map((step, index): WorkflowStep => {
        const tag: WorkflowStep['tag'] = step.id === highlightedStepId ? 'STUDENT ERROR' : undefined

        return {
          id: step.id || `analysis-step-${index + 1}`,
          number: index + 1,
          title: step.shortLabel?.trim() || step.studentText?.trim() || step.normalizedMath?.trim() || '',
          detail: step.kidFriendlyExplanation?.trim() || step.correction?.trim() || step.hint?.trim() || '',
          status: step.status,
          studentText: step.studentText?.trim() || step.normalizedMath?.trim() || '',
          correction: step.correction?.trim() || '',
          hint: step.hint?.trim() || '',
          explanation: step.kidFriendlyExplanation?.trim() || '',
          tag,
        }
      })
      .filter((step) => hasVisibleText(step.title) || hasVisibleText(step.detail) || hasVisibleText(step.studentText))
  }

  return []
}

function getCurrentWorkflowStep(steps: WorkflowStep[]): WorkflowStep | null {
  return steps.find((step) => isCoachingStatus(step.status)) ?? steps[0] ?? null
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

  return ''
}

function extractFirstSentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/)
  return (match?.[1] ?? trimmed).trim()
}

function getLikelyMisconception(
  analysis: WhiteboardTutorResponse | null,
  analysisResult: TutorAnalysisResult | null | undefined,
  currentStep: WorkflowStep | null,
): string | null {
  if (!currentStep) return null

  const candidateTexts = [
    currentStep.correction ?? '',
    currentStep.hint ?? '',
    currentStep.explanation ?? '',
    analysis?.sections?.errorsFound ?? '',
    analysisResult?.overallSummary ?? '',
  ].filter(Boolean)

  const firstSentence = candidateTexts.map(extractFirstSentence).find(Boolean)
  if (firstSentence) {
    return firstSentence
  }

  return null
}

function buildTutorResponseModeCard({
  mode,
  diagnosis,
  nextMove,
  fullHelp,
  solutionText,
  focusStep,
}: {
  mode: TutorResponseMode
  diagnosis: string
  nextMove: string
  fullHelp: string
  solutionText: string
  focusStep: StepCard | null
}): TutorResponseModeCard {
  const focusText = focusStep?.title ? `Focus on ${focusStep.title.toLowerCase()}.` : ''

  if (mode === 'full') {
    return {
      id: 'full',
      label: 'Full help',
      summary: 'Full explanation, worked steps, and teaching support.',
      detail: fullHelp || nextMove || diagnosis,
      ctaLabel: 'Use full-help response',
      emphasisClassName: 'text-sky-200',
      buttonClassName: 'border-sky-400/30 bg-sky-500/[0.08] text-[#F9FAFB] hover:border-sky-300/50 hover:bg-sky-500/[0.12]',
      panelClassName: 'border-sky-400/22 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(20,38,61,0.98))]',
    }
  }

  return {
    id: 'quick',
    label: 'Quick help',
    summary: 'See the mistake and the correct answer fast.',
    detail: [diagnosis, solutionText ? `Correct answer: ${solutionText}.` : null, nextMove || focusText || null].filter(Boolean).join(' '),
    ctaLabel: 'Use quick-help response',
    emphasisClassName: 'text-amber-100',
    buttonClassName: 'border-amber-300/35 bg-amber-500/[0.12] text-[#F9FAFB] hover:border-amber-300/55 hover:bg-amber-500/[0.16]',
    panelClassName: 'border-amber-300/25 bg-[linear-gradient(180deg,rgba(55,39,16,0.94),rgba(17,24,39,0.98))]',
  }
}

function buildNextMovePlaybook(
  analysis: WhiteboardTutorResponse | null,
  analysisResult: TutorAnalysisResult | null | undefined,
  currentStep: WorkflowStep | null,
): NextMovePlaybook {
  if (!currentStep) {
    return {
      ask: '',
      hint: '',
      explain: '',
      checkUnderstanding: '',
    }
  }

  return {
    ask: currentStep.hint || '',
    hint: currentStep.explanation || currentStep.detail,
    explain: currentStep.correction || analysisResult?.overallSummary || analysis?.sections?.stepsAnalysis || '',
    checkUnderstanding: '',
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
          <div className="mt-1 text-[16px] font-semibold text-[#F9FAFB]">Likely issue: {getLikelyIssueSummary(primaryDiagnosisIssue) || 'No likely issue available from this analysis.'}</div>
          <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">{primaryDiagnosisIssue.detail || 'No supporting detail is available from this analysis.'}</p>
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
  primaryDiagnosisIssue: StepCard | null
  problemText: string
  answerPairText: string
  variant?: PanelVariant
}): React.JSX.Element {
  if (stepCards.length === 0 || !problemText.trim() || !primaryDiagnosisIssue) {
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
          problemText={problemText}
          answerPairText={answerPairText}
          variant="detail"
        />
      </div>
    </div>
  )
}

function AIReviewPanel({
  analysis,
  analysisResult,
  analysisLoading,
  analysisPendingConfirmation = false,
  onStartAnalysis,
  onRetryAnalysis,
  overlayVisible = false,
  tutorWalkthroughActive = false,
  tutorPlaybackIsPlaying = false,
  activeTutorStepId,
  onToggleTutorOverlay,
  onTutorWalkthroughEnter,
  onTutorWalkthroughExit,
  onTutorPlaybackPause,
  onTutorPlaybackPlay,
  onTutorPlaybackPrevious,
  onTutorPlaybackNext,
  onClearAnalysisReview,
}: {
  analysis: WhiteboardTutorResponse | null
  analysisResult: TutorAnalysisResult | null
  analysisLoading: boolean
  analysisPendingConfirmation?: boolean
  onStartAnalysis: (mode: 'quick' | 'full') => void
  onRetryAnalysis: (mode: 'quick' | 'full') => void
  overlayVisible?: boolean
  tutorWalkthroughActive?: boolean
  tutorPlaybackIsPlaying?: boolean
  activeTutorStepId?: string | null
  onToggleTutorOverlay?: () => void
  onTutorWalkthroughEnter?: () => void
  onTutorWalkthroughExit?: () => void
  onTutorPlaybackPause?: () => void
  onTutorPlaybackPlay?: () => void
  onTutorPlaybackPrevious?: () => void
  onTutorPlaybackNext?: () => void
  onClearAnalysisReview?: () => void
}): React.JSX.Element {
  const [engineResponseVisible, setEngineResponseVisible] = useState(false)
  const analysisSourceLabel = useMemo(() => getAnalysisSourceLabel(analysis), [analysis])
  const stepCards = useMemo(() => buildStepCards(analysisResult), [analysisResult])
  const primaryDiagnosisIssue = useMemo(() => getPrimaryDiagnosisIssue(stepCards), [stepCards])
  const problemText = useMemo(() => getProblemText(analysis, analysisResult), [analysis, analysisResult])
  const answerPairText = useMemo(() => getAnswerPairText(analysis, analysisResult), [analysis, analysisResult])
  const guidedSteps = useMemo(() => analysisResult?.guidedSolutionSteps ?? analysisResult?.steps ?? [], [analysisResult])
  const guidedIndex = useMemo(() => {
    if (!guidedSteps.length) return 0
    if (!activeTutorStepId) return 0
    const matchIndex = guidedSteps.findIndex((step) => step.id === activeTutorStepId)
    return matchIndex >= 0 ? matchIndex : 0
  }, [activeTutorStepId, guidedSteps])
  const guidedStep = guidedSteps[guidedIndex] ?? null
  const previewStep = guidedSteps[Math.min(guidedIndex + 1, Math.max(guidedSteps.length - 1, 0))] ?? guidedStep
  const engineResponsePreview = useMemo(() => buildEngineResponsePreview(analysis, analysisResult), [analysis, analysisResult])
  const unsupportedDeterministic = Boolean(
    analysis
    && analysis.analysisPipeline?.deterministic?.supported === false
    && stepCards.length === 0
    && !answerPairText
    && !guidedSteps.length,
  )
  const needsReviewEntry = !analysis || !analysisResult || (!analysisLoading && stepCards.length === 0 && !answerPairText)
  const isFallbackReview = Boolean(analysis?.analysisPipeline?.fallback?.ran)
  const summaryText = isFallbackReview
    ? 'This problem needed a deeper review pass. Use the answer and next step below as the teaching guide.'
    : analysisResult?.overallSummary?.trim() || primaryDiagnosisIssue?.detail || 'Review the current work before giving the next hint.'
  const likelyMistakeText = primaryDiagnosisIssue?.detail || primaryDiagnosisIssue?.title || 'No likely mistake available from this review.'
  const studentLineText = guidedStep?.studentText || guidedStep?.normalizedMath || primaryDiagnosisIssue?.title || ''
  const guidedNextStepText = analysisResult?.steps.find((step) => step.status !== 'correct')?.correction?.trim()
    || analysisResult?.steps.find((step) => step.status !== 'correct')?.kidFriendlyExplanation?.trim()
    || analysisResult?.steps.find((step) => step.status !== 'correct')?.hint?.trim()
    || ''

  const handleCopyEngineResponse = async () => {
    if (!navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(engineResponsePreview)
  }

  const handleStartWalkthrough = () => {
    if (!overlayVisible) {
      onToggleTutorOverlay?.()
    }
    onTutorWalkthroughEnter?.()
  }

  const handleClearWalkthrough = () => {
    if (overlayVisible) {
      onToggleTutorOverlay?.()
    }
    onTutorWalkthroughExit?.()
  }

  const handleClearReview = () => {
    if (!onClearAnalysisReview) return
    if (window.confirm('Clear this AI review?')) {
      onClearAnalysisReview()
    }
  }

  if (unsupportedDeterministic) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <div className="mx-auto flex max-w-[340px] flex-col items-center gap-4 rounded-[16px] border border-white/10 bg-white/[0.03] px-5 py-6 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
          <Lightbulb className="h-10 w-10 text-[#6B7280]" strokeWidth={1.75} aria-hidden="true" />
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-[#F9FAFB]">Review needs a different pass</h3>
            <p className="text-sm leading-6 text-[#9CA3AF]">This problem needs a deeper review before the board walkthrough is ready.</p>
          </div>
        </div>
      </div>
    )
  }

  if (needsReviewEntry) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <div className="mx-auto flex max-w-[340px] flex-col items-center gap-4 rounded-[16px] border border-white/10 bg-white/[0.03] px-5 py-6 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
          <Sparkles className="h-10 w-10 text-[#F59E0B]" strokeWidth={1.75} aria-hidden="true" />
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-[#F9FAFB]">AI Review</h3>
            <p className="text-sm leading-6 text-[#9CA3AF]">Run one review pass to get a likely mistake, next step, and board walkthrough.</p>
          </div>
          <button
            type="button"
            onClick={() => onStartAnalysis('quick')}
            disabled={analysisLoading || analysisPendingConfirmation}
            className="rounded-[10px] bg-[#F59E0B] px-4 py-2 text-[13px] font-semibold text-black transition hover:bg-[#f2ab28] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analysisLoading ? 'Reviewing…' : analysisPendingConfirmation ? 'Confirming…' : 'Review work'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111827] p-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 pb-6">
          <section className="rounded-[16px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.98),rgba(15,23,42,0.96))] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">AI Review</div>
                <h3 className="mt-2 text-[18px] font-semibold text-[#F9FAFB]">{problemText || 'Current work review'}</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onRetryAnalysis('quick')}
                  disabled={analysisLoading || analysisPendingConfirmation}
                  className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {analysisLoading ? 'Reviewing…' : analysisPendingConfirmation ? 'Confirming…' : 'Refresh review'}
                </button>
                {onClearAnalysisReview ? (
                  <button
                    type="button"
                    onClick={handleClearReview}
                    className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                  >
                    Clear AI review
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {answerPairText ? <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-200">{answerPairText}</span> : null}
              {analysisSourceLabel ? <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 font-semibold text-sky-200">{analysisSourceLabel}</span> : null}
            </div>
          </section>

          <section className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Summary</div>
            <p className="mt-2 text-[14px] leading-6 text-[#F9FAFB]">{summaryText}</p>
          </section>

          <section className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Likely mistake</div>
            <p className="mt-2 text-[14px] leading-6 text-[#F9FAFB]">{likelyMistakeText}</p>
          </section>

          {studentLineText ? (
            <section className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Student line</div>
              <p className="mt-2 text-[14px] font-medium text-[#F9FAFB]">{studentLineText}</p>
            </section>
          ) : null}

          {guidedNextStepText ? (
            <section className="rounded-[14px] border border-sky-400/18 bg-sky-500/[0.06] px-4 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-200/80">Guided next step</div>
              <p className="mt-2 text-[14px] leading-6 text-[#F9FAFB]">{guidedNextStepText}</p>
            </section>
          ) : null}

          {guidedStep ? (
            <section className="rounded-[14px] border border-amber-400/20 bg-amber-500/10 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100/80">Walkthrough</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-semibold text-[#F9FAFB]">{overlayVisible ? 'Board markers on' : 'Board markers off'}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-semibold text-[#F9FAFB]">Step {guidedIndex + 1} of {guidedSteps.length}</span>
                    {tutorWalkthroughActive && tutorPlaybackIsPlaying ? <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-200">Playing</span> : null}
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-[12px] border border-white/10 bg-black/15 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">{tutorWalkthroughActive ? 'Current line' : 'Next line to show'}</div>
                <div className="mt-2 text-[15px] font-semibold text-[#F9FAFB]">{previewStep?.studentText || previewStep?.normalizedMath || previewStep?.shortLabel || ''}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {tutorWalkthroughActive ? (
                  <>
                    <button
                      type="button"
                      onClick={tutorPlaybackIsPlaying ? onTutorPlaybackPause : onTutorPlaybackPlay}
                      className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                    >
                      {tutorPlaybackIsPlaying ? 'Pause walkthrough' : 'Play walkthrough'}
                    </button>
                    <button
                      type="button"
                      onClick={onTutorPlaybackPrevious}
                      className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={onTutorPlaybackNext}
                      className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={handleClearWalkthrough}
                      className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                    >
                      Clear walkthrough
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartWalkthrough}
                    className="rounded-[10px] bg-[#F59E0B] px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-[#f2ab28]"
                  >
                    Start walkthrough
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {import.meta.env.DEV ? (
            <details className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-4">
              <summary className="cursor-pointer text-[12px] font-semibold text-[#D1D5DB]">Technical details</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEngineResponseVisible((current) => !current)}
                  className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                >
                  {engineResponseVisible ? 'Hide details' : 'View details'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyEngineResponse()}
                  disabled={!navigator.clipboard?.writeText}
                  className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Copy JSON
                </button>
              </div>
              {engineResponseVisible ? (
                <div className="mt-3 rounded-[12px] border border-white/10 bg-black/15 px-3 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-100/85">Engine response</div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-[#D1D5DB]">{engineResponsePreview}</pre>
                </div>
              ) : null}
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TutorAssistReadyState({
  isLoading,
  onQuickAssist,
  onDeeperHelp,
  error,
  onRetry,
}: {
  isLoading: boolean
  onQuickAssist: () => void
  onDeeperHelp: () => void
  error: string | null
  onRetry: (() => void) | null
}): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="mx-auto flex max-w-[320px] flex-col items-center">
        <Sparkles className="h-9 w-9 text-[#F59E0B]" strokeWidth={1.8} aria-hidden="true" />
        <h3 className="mt-4 text-[16px] font-semibold text-[#F9FAFB]">Tutor Assist</h3>
        <p className="mt-2 max-w-[260px] text-[13px] leading-6 text-[#9CA3AF]">
          AI help is optional. Start short, or open deeper teaching support when you need more.
        </p>

        {error ? (
          <div className="mt-5 w-full rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-left">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-100/80">Assist request failed</div>
            <p className="mt-2 text-[13px] leading-6 text-red-100/90">{error}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-[8px] border border-white/10 bg-white/10 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-white/15"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 grid w-full gap-3 text-left">
            <button
              type="button"
              onClick={onQuickAssist}
              disabled={isLoading}
              className="rounded-[12px] border border-amber-300/35 bg-amber-500/12 px-4 py-3 text-left transition hover:border-amber-300/55 hover:bg-amber-500/16 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="text-[14px] font-semibold text-[#F9FAFB]">Quick help</div>
              <div className="mt-1 text-[12px] leading-5 text-[#D1D5DB]">See the mistake and the correct answer fast.</div>
            </button>
            <button
              type="button"
              onClick={onDeeperHelp}
              disabled={isLoading}
              className="rounded-[12px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="text-[14px] font-semibold text-[#F9FAFB]">Full help</div>
              <div className="mt-1 text-[12px] leading-5 text-[#D1D5DB]">Get a full explanation, worked steps, and teaching tips.</div>
            </button>
          </div>
        )}
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

function renderTutorAssistSummaryRow({
  modelSummary,
  confidence,
  canUseStrongerModel,
  onUseStrongerModel,
}: {
  modelSummary: TutorModelSummary | null
  confidence: TutorConfidenceState | null
  canUseStrongerModel: boolean
  onUseStrongerModel?: () => void
}): React.JSX.Element | null {
  if (!modelSummary && !confidence && !canUseStrongerModel) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {modelSummary ? (
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#F9FAFB]">
          Model: {modelSummary.label}
        </span>
      ) : null}
      {modelSummary?.tier === 'stronger' ? (
        <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
          Stronger model used
        </span>
      ) : null}
      {confidence?.label ? (
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getTutorConfidenceBadgeClass(confidence.level)}`}>
          {confidence.label}
        </span>
      ) : null}
      {canUseStrongerModel && onUseStrongerModel ? (
        <button
          type="button"
          onClick={onUseStrongerModel}
          className="rounded-full border border-amber-300/25 bg-amber-500/12 px-3 py-1 text-[11px] font-semibold text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-500/18"
        >
          Use stronger model
        </button>
      ) : null}
      {modelSummary?.detail ? <p className="basis-full text-[12px] leading-6 text-[#9CA3AF]">{modelSummary.detail}</p> : null}
      {confidence?.detail ? <p className="basis-full text-[12px] leading-6 text-[#9CA3AF]">{confidence.detail}</p> : null}
    </div>
  )
}

function TutorAssistSimpleState({
  summary,
  onRefresh,
  onUseReply,
  onGoDeeper,
  onClose,
  onUseStrongerModel,
  boardActionContext,
  onBoardAction,
}: {
  summary: TutorAssistSummaryState
  onRefresh: () => void
  onUseReply: (value: string) => void
  onGoDeeper?: () => void
  onClose: () => void
  onUseStrongerModel?: () => void
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
}): React.JSX.Element {
  return (
    <div className="space-y-3 pb-4">
      <section className="rounded-[16px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.98),rgba(15,23,42,0.96))] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Tutor Assist</div>
            <h3 className="mt-2 text-[18px] font-semibold text-[#F9FAFB]">Keep it short and usable.</h3>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] font-medium text-[#6B7280] transition hover:text-[#9CA3AF]">
            Refresh
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {renderTutorAssistSummaryRow({
            modelSummary: summary.modelSummary,
            confidence: summary.confidence,
            canUseStrongerModel: summary.canUseStrongerModel,
            onUseStrongerModel,
          })}

          {summary.diagnosis ? (
            <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Likely issue</div>
              <p className="mt-2 text-[15px] font-semibold leading-6 text-[#F9FAFB]">{summary.diagnosis}</p>
            </div>
          ) : null}

          {summary.nextMove ? (
            <div className="rounded-[14px] border border-sky-400/18 bg-sky-500/[0.06] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-200/80">What to say next</div>
              <p className="mt-2 text-[15px] leading-6 text-[#F9FAFB]">{summary.nextMove}</p>
            </div>
          ) : null}

          {summary.focusStep && summary.evidenceText ? (
            <div className="rounded-[14px] border border-amber-400/20 bg-amber-500/10 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100/80">Board focus</div>
                  <p className="mt-2 text-[14px] font-semibold text-[#F9FAFB]">Step {summary.focusStep.number}: {summary.focusStep.title}</p>
                  <p className="mt-1 text-[12px] leading-5 text-amber-100/85">{summary.evidenceText}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onBoardAction(summary.focusStep!.number, 'mark', 'assist')}
                  aria-pressed={isBoardActionActive(boardActionContext, 'assist', 'mark', summary.focusStep.number)}
                  className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                    isBoardActionActive(boardActionContext, 'assist', 'mark', summary.focusStep.number)
                      ? 'border-amber-300/60 bg-amber-500/20 text-amber-50'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/15'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Focus board here
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {summary.nextMove ? (
            <button
              type="button"
              onClick={() => onUseReply(summary.nextMove!)}
              className="inline-flex items-center rounded-[10px] bg-[#F59E0B] px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-[#f2ab28]"
            >
              Use this reply
            </button>
          ) : null}
          {onGoDeeper ? (
            <button
              type="button"
              onClick={onGoDeeper}
              className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
            >
              Go deeper
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  )
}

function TutorAssistDeepState({
  privateNotes,
  onPrivateNotesChange,
  onRefresh,
  onUseStrongerModel,
  summary,
  onBack,
  onClose,
  boardActionContext,
  onBoardAction,
  evidenceText,
  detailedExplanation,
  solutionText,
  stepCards,
  validatorNotes,
  walkthroughActive,
  activeWalkthroughStep,
  activeWalkthroughEvidence,
  walkthroughStepIds,
  walkthroughStepIndex,
  walkthroughStepCount,
  canWalkthroughPlay,
  isWalkthroughPlaying,
  onEnterWalkthrough,
  onExitWalkthrough,
  onWalkthroughSelectStep,
  onWalkthroughPrevious,
  onWalkthroughNext,
  onWalkthroughPlay,
  onWalkthroughPause,
  onWalkthroughReplay,
  variant = 'detail',
}: {
  privateNotes: string
  onPrivateNotesChange: (value: string) => void
  onRefresh: () => void
  onUseStrongerModel?: () => void
  summary: TutorAssistSummaryState
  onBack: () => void
  onClose: () => void
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  evidenceText: string
  detailedExplanation: string
  solutionText: string
  stepCards: StepCard[]
  validatorNotes: string[]
  walkthroughActive: boolean
  activeWalkthroughStep: StepCard | null
  activeWalkthroughEvidence: string
  walkthroughStepIds: Array<string | null>
  walkthroughStepIndex: number
  walkthroughStepCount: number
  canWalkthroughPlay: boolean
  isWalkthroughPlaying: boolean
  onEnterWalkthrough?: () => void
  onExitWalkthrough?: () => void
  onWalkthroughSelectStep?: (stepId: string | null) => void
  onWalkthroughPrevious?: () => void
  onWalkthroughNext?: () => void
  onWalkthroughPlay?: () => void
  onWalkthroughPause?: () => void
  onWalkthroughReplay?: () => void
  variant?: PanelVariant
}): React.JSX.Element {
  const [solutionOpen, setSolutionOpen] = useState(false)
  const [rationaleOpen, setRationaleOpen] = useState(false)
  const [validatorOpen, setValidatorOpen] = useState(false)

  return (
    <div className={`space-y-3 ${variant === 'detail' ? 'pb-4' : ''}`}>
      <section className="rounded-[16px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.98),rgba(15,23,42,0.96))] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Tutor Assist</div>
            <h3 className="mt-2 text-[18px] font-semibold text-[#F9FAFB]">Deep Assist</h3>
          </div>
          <button type="button" onClick={onRefresh} className="text-[11px] font-medium text-[#6B7280] transition hover:text-[#9CA3AF]">
            Refresh
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {renderTutorAssistSummaryRow({
            modelSummary: summary.modelSummary,
            confidence: summary.confidence,
            canUseStrongerModel: summary.canUseStrongerModel,
            onUseStrongerModel,
          })}
          {summary.diagnosis ? (
            <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Likely issue</div>
              <p className="mt-2 text-[15px] font-semibold leading-6 text-[#F9FAFB]">{summary.diagnosis}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
          >
            Back to simple assist
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
          >
            Close
          </button>
        </div>
      </section>

      {(walkthroughActive || stepCards.length > 0) ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Walkthrough</span>
                <span className="mt-1 block text-[13px] text-[#D1D5DB]">
                  {walkthroughActive ? 'One step at a time, with the overlay following only while deep assist is active.' : 'Open the guided sequence only when you need step-by-step support.'}
                </span>
              </span>
              {walkthroughActive ? (
                <button
                  type="button"
                  onClick={onExitWalkthrough}
                  className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                >
                  Exit walkthrough
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onEnterWalkthrough}
                  disabled={stepCards.length === 0}
                  className="rounded-[10px] border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-100 transition hover:border-amber-400/35 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Walk me through it
                </button>
              )}
            </div>

            {walkthroughActive && activeWalkthroughStep ? (
              <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                <article className="rounded-[12px] border border-amber-300/30 bg-amber-500/[0.08] px-3 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#78350F] text-[11px] font-bold text-[#F59E0B]">
                      {activeWalkthroughStep.number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[13px] font-medium text-[#F9FAFB]">{activeWalkthroughStep.title}</div>
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-[#D1D5DB]">
                          Step {walkthroughStepIndex + 1} of {walkthroughStepCount}
                        </span>
                      </div>
                      {activeWalkthroughStep.detail ? <p className="mt-1 text-[12px] leading-5 text-[#D1D5DB]">{activeWalkthroughStep.detail}</p> : null}
                      {activeWalkthroughEvidence ? (
                        <div className="mt-3 rounded-[10px] border border-white/10 bg-black/15 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Active evidence</div>
                          <p className="mt-1 text-[12px] leading-5 text-[#D1D5DB]">{activeWalkthroughEvidence}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onWalkthroughPrevious}
                    className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={isWalkthroughPlaying ? onWalkthroughPause : onWalkthroughPlay}
                    disabled={!canWalkthroughPlay}
                    className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isWalkthroughPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={onWalkthroughNext}
                    className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={onWalkthroughReplay}
                    disabled={walkthroughStepCount === 0}
                    className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Replay
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onBoardAction(activeWalkthroughStep.number, 'mark', 'assist')}
                    aria-pressed={isBoardActionActive(boardActionContext, 'assist', 'mark', activeWalkthroughStep.number)}
                    className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition ${
                      isBoardActionActive(boardActionContext, 'assist', 'mark', activeWalkthroughStep.number)
                        ? 'border-amber-300/60 bg-amber-500/20 text-amber-50'
                        : 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:border-amber-400/35 hover:bg-amber-500/15'
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Focus on board
                  </button>
                  <button
                    type="button"
                    onClick={() => onBoardAction(activeWalkthroughStep.number, 'annotate', 'assist')}
                    aria-pressed={isBoardActionActive(boardActionContext, 'assist', 'annotate', activeWalkthroughStep.number)}
                    className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-medium transition ${
                      isBoardActionActive(boardActionContext, 'assist', 'annotate', activeWalkthroughStep.number)
                        ? 'border-sky-300/50 bg-sky-500/14 text-sky-100'
                        : 'border-white/10 bg-white/[0.03] text-[#D1D5DB] hover:border-white/20 hover:text-[#F9FAFB]'
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Annotate
                  </button>
                </div>
              </div>
            ) : null}

            {!walkthroughActive && stepCards.length > 0 ? (
              <div className="mt-3 rounded-[10px] border border-white/10 bg-black/15 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Start from a step</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {stepCards.map((step, index) => (
                    <button
                      key={step.number}
                      type="button"
                      onClick={() => {
                        onEnterWalkthrough?.()
                        onWalkthroughSelectStep?.(walkthroughStepIds[index] ?? null)
                      }}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
                    >
                      Step {step.number}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {evidenceText ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Evidence from student work</div>
          <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">{evidenceText}</p>
        </section>
      ) : null}

      {solutionText ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setSolutionOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={solutionOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Reveal solution</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Keep the answer hidden until the tutor actually needs it.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${solutionOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {solutionOpen ? <div className="border-t border-white/10 px-4 py-3 text-[15px] font-semibold text-[#F9FAFB]">{solutionText}</div> : null}
        </section>
      ) : null}

      {detailedExplanation ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setRationaleOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={rationaleOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Detailed rationale</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Full explanation stays behind disclosure instead of crowding the first screen.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${rationaleOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {rationaleOpen ? <div className="border-t border-white/10 px-4 py-3 text-[13px] leading-6 text-[#D1D5DB]">{detailedExplanation}</div> : null}
        </section>
      ) : null}

      {validatorNotes.length > 0 ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setValidatorOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={validatorOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Validator notes</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Extra cautions from the structured analysis.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${validatorOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {validatorOpen ? (
            <div className="border-t border-white/10 px-4 py-3 text-[13px] leading-6 text-[#D1D5DB]">
              {validatorNotes.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
        </section>
      ) : null}

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
        </div>
      ) : null}
    </div>
  )
}

function TutorAssistPanel({
  initialState = 'ready',
  assistContextKey = null,
  analysis,
  analysisMode,
  analysisResult,
  analysisLoading,
  analysisError,
  onStartAnalysis,
  onUseStrongerModel,
  activeTutorStepId,
  tutorWalkthroughActive = false,
  tutorPlaybackCanPlay = false,
  tutorPlaybackIsPlaying = false,
  onTutorWalkthroughEnter,
  onTutorWalkthroughExit,
  onTutorPlaybackPlay,
  onTutorPlaybackPause,
  onTutorPlaybackPrevious,
  onTutorPlaybackNext,
  onTutorPlaybackReplay,
  onTutorStepSelect,
  variant = 'detail',
  onUseReply,
  boardActionContext,
  onBoardAction,
  onLessonMessageChange,
  loadingTargetState = 'simple',
}: {
  initialState?: TutorAssistViewState
  assistContextKey?: string | null
  analysis: WhiteboardTutorResponse | null
  analysisMode?: 'quick' | 'full' | null
  analysisResult: TutorAnalysisResult | null
  analysisLoading: boolean
  analysisError: string | null
  onStartAnalysis: (mode: 'quick' | 'full') => void
  onUseStrongerModel?: (mode: 'quick' | 'full') => void
  activeTutorStepId?: string | null
  tutorWalkthroughActive?: boolean
  tutorPlaybackCanPlay?: boolean
  tutorPlaybackIsPlaying?: boolean
  onTutorWalkthroughEnter?: () => void
  onTutorWalkthroughExit?: () => void
  onTutorPlaybackPlay?: () => void
  onTutorPlaybackPause?: () => void
  onTutorPlaybackPrevious?: () => void
  onTutorPlaybackNext?: () => void
  onTutorPlaybackReplay?: () => void
  onTutorStepSelect?: (stepId: string | null) => void
  variant?: PanelVariant
  onUseReply: (value: string) => void
  boardActionContext: BoardActionContext | null
  onBoardAction: (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => void
  onLessonMessageChange?: (message: TutorLessonMessage | null) => void
  loadingTargetState?: TutorAssistRequestMode
}): React.JSX.Element {
  const normalizedAssistContextKey = useMemo(() => (typeof assistContextKey === 'string' ? assistContextKey.trim() : ''), [assistContextKey])
  const [viewState, setViewState] = useState<TutorAssistViewState>(() => readStoredTutorAssistState(normalizedAssistContextKey)?.viewState ?? initialState)
  const [privateNotes, setPrivateNotes] = useState<string>(() => readStoredTutorAssistState(normalizedAssistContextKey)?.notes ?? '')
  const [hydratedAssistContextKey, setHydratedAssistContextKey] = useState('')
  const [pendingLoadTargetState, setPendingLoadTargetState] = useState<TutorAssistRequestMode>(loadingTargetState)
  const sawExternalLoadingRef = useRef(false)
  const modelSummary = useMemo(() => getTutorModelSummary(analysis), [analysis])
  const issueStep = useMemo(() => analysisResult?.steps.find((step) => step.status !== 'correct') ?? null, [analysisResult])
  const confidence = useMemo(() => getTutorConfidenceState(analysisResult, issueStep), [analysisResult, issueStep])
  const stepCards = useMemo(() => buildStepCards(analysisResult), [analysisResult])
  const walkthroughStepIds = useMemo(() => stepCards.map((_, index) => analysisResult?.steps[index]?.id ?? null), [analysisResult, stepCards])
  const activeWalkthroughIndex = useMemo(
    () => analysisResult?.steps.findIndex((step) => step.id === activeTutorStepId) ?? -1,
    [activeTutorStepId, analysisResult],
  )
  const activeWalkthroughStep = useMemo(
    () => (activeWalkthroughIndex >= 0 ? stepCards[activeWalkthroughIndex] ?? null : null),
    [activeWalkthroughIndex, stepCards],
  )
  const activeWalkthroughEvidence = useMemo(() => {
    if (activeWalkthroughIndex < 0) {
      return ''
    }

    const step = analysisResult?.steps[activeWalkthroughIndex]
    return step?.studentText?.trim() || step?.normalizedMath?.trim() || ''
  }, [activeWalkthroughIndex, activeWalkthroughStep?.detail, analysisResult])
  const diagnosis = useMemo(
    () => issueStep?.correction?.trim() || issueStep?.kidFriendlyExplanation?.trim() || issueStep?.shortLabel?.trim() || null,
    [issueStep],
  )
  const nextMove = useMemo(
    () => issueStep?.hint?.trim() || null,
    [issueStep],
  )
  const evidenceText = useMemo(
    () => issueStep?.studentText?.trim() || issueStep?.normalizedMath?.trim() || '',
    [issueStep],
  )
  const detailedExplanation = useMemo(
    () => analysisResult?.overallSummary?.trim() || '',
    [analysisResult?.overallSummary],
  )
  const solutionText = useMemo(
    () => analysisResult?.finalAnswers?.filter(Boolean).join(' or ') || analysis?.correctSolution?.trim() || '',
    [analysis?.correctSolution, analysisResult],
  )
  const validatorNotes = analysisResult?.validatorWarnings ?? []
  const focusStep = useMemo(() => getPrimaryDiagnosisIssue(stepCards), [stepCards])
  const canUseStrongerModel = Boolean(onUseStrongerModel) && Boolean(modelSummary?.strongerModelAvailable) && modelSummary?.tier !== 'stronger'
  const hasDeepAssistContent = Boolean(
    stepCards.length > 0
    || evidenceText
    || detailedExplanation
    || solutionText
    || validatorNotes.length > 0
    || tutorWalkthroughActive,
  )
  const summary = useMemo<TutorAssistSummaryState>(() => ({
    diagnosis,
    nextMove,
    focusStep,
    evidenceText,
    modelSummary,
    confidence,
    canUseStrongerModel,
  }), [canUseStrongerModel, confidence, diagnosis, evidenceText, focusStep, modelSummary, nextMove])
  const lessonMessage = useMemo(() => buildTutorAssistLessonMessage(summary), [summary])

  useEffect(() => {
    const storedState = readStoredTutorAssistState(normalizedAssistContextKey)
    setViewState(storedState?.viewState ?? initialState)
    setPrivateNotes(storedState?.notes ?? '')
    setPendingLoadTargetState(loadingTargetState)
    sawExternalLoadingRef.current = false
    setHydratedAssistContextKey(normalizedAssistContextKey)
  }, [initialState, loadingTargetState, normalizedAssistContextKey])

  useEffect(() => {
    if (hydratedAssistContextKey !== normalizedAssistContextKey) {
      return
    }

    writeStoredTutorAssistState(normalizedAssistContextKey, viewState, privateNotes)
  }, [hydratedAssistContextKey, normalizedAssistContextKey, privateNotes, viewState])

  useEffect(() => {
    if (analysisLoading) {
      sawExternalLoadingRef.current = true
      return
    }

    if (viewState === 'loading' && (sawExternalLoadingRef.current || analysisResult || analysis || analysisError)) {
      setViewState(analysisResult || analysis ? pendingLoadTargetState : 'ready')
      sawExternalLoadingRef.current = false
    }
  }, [analysis, analysisError, analysisLoading, analysisResult, pendingLoadTargetState, viewState])

  useEffect(() => {
    if (viewState === 'deep' && !hasDeepAssistContent) {
      setViewState('simple')
    }
  }, [hasDeepAssistContent, viewState])

  useEffect(() => {
    if (viewState === 'ready') {
      onLessonMessageChange?.(null)
      return
    }

    onLessonMessageChange?.(lessonMessage)
  }, [lessonMessage, onLessonMessageChange, viewState])

  const requestAssist = (mode: TutorAssistRequestMode) => {
    setPendingLoadTargetState(mode)

    const requestedHelpMode = mode === 'deep' ? 'full' : 'quick'

    if ((analysisResult || analysis) && analysisMode === requestedHelpMode) {
      setViewState(mode)
      return
    }

    onStartAnalysis(requestedHelpMode)
    setViewState('loading')
  }

  const refreshAssist = (mode: TutorAssistRequestMode = viewState === 'deep' ? 'deep' : 'simple') => {
    setPendingLoadTargetState(mode)
    onStartAnalysis(mode === 'deep' ? 'full' : 'quick')
    setViewState('loading')
  }

  const handlePrivateNotesChange = (value: string) => {
    setPrivateNotes(value)
    writeStoredTutorAssistState(normalizedAssistContextKey, viewState, value)
  }

  const handleClose = () => {
    setViewState('ready')
    onTutorWalkthroughExit?.()
  }

  const effectiveState = analysisLoading ? 'loading' : viewState

  if (variant === 'workflow') {
    return (
      <div className="bg-transparent px-4 pb-4 pt-1">
        {effectiveState === 'ready' ? (
          <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#8f867d]">Tutor Assist</div>
              <div className="mt-1 text-[14px] font-semibold text-[#F9FAFB]">Need help with this problem?</div>
            </div>
            <div className="mt-2 text-[12px] leading-6 text-[#9CA3AF]">Quick help for the fast answer, or full help when you want the whole explanation.</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => requestAssist('simple')}
                disabled={analysisLoading}
                className="rounded-[10px] bg-[#F59E0B] px-3 py-2.5 text-left text-[12px] font-semibold text-black transition hover:bg-[#f2ab28] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div>Quick help</div>
                <div className="mt-1 text-[11px] font-medium text-black/75">See the mistake and the correct answer fast.</div>
              </button>
              <button
                type="button"
                onClick={() => requestAssist('deep')}
                disabled={analysisLoading}
                className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-[12px] font-semibold text-[#F9FAFB] transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div>Full help</div>
                <div className="mt-1 text-[11px] font-medium text-[#9CA3AF]">Full explanation, worked steps, and teaching tips.</div>
              </button>
            </div>
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

        {effectiveState === 'simple' ? (
          <TutorAssistSimpleState
            summary={summary}
            onRefresh={() => refreshAssist('simple')}
            onUseReply={onUseReply}
            onGoDeeper={hasDeepAssistContent ? () => setViewState('deep') : undefined}
            onClose={handleClose}
            onUseStrongerModel={onUseStrongerModel ? () => onUseStrongerModel('quick') : undefined}
            boardActionContext={boardActionContext}
            onBoardAction={onBoardAction}
          />
        ) : null}

        {effectiveState === 'deep' ? (
          <TutorAssistDeepState
            privateNotes={privateNotes}
            onPrivateNotesChange={handlePrivateNotesChange}
            onRefresh={() => refreshAssist('deep')}
            onUseStrongerModel={onUseStrongerModel ? () => onUseStrongerModel('full') : undefined}
            summary={summary}
            onBack={() => setViewState('simple')}
            onClose={handleClose}
            boardActionContext={boardActionContext}
            onBoardAction={onBoardAction}
            evidenceText={evidenceText}
            detailedExplanation={detailedExplanation}
            solutionText={solutionText}
            stepCards={stepCards}
            validatorNotes={validatorNotes}
            walkthroughActive={tutorWalkthroughActive}
            activeWalkthroughStep={activeWalkthroughStep}
            activeWalkthroughEvidence={activeWalkthroughEvidence}
            walkthroughStepIds={walkthroughStepIds}
            walkthroughStepIndex={activeWalkthroughIndex}
            walkthroughStepCount={stepCards.length}
            canWalkthroughPlay={tutorPlaybackCanPlay}
            isWalkthroughPlaying={tutorPlaybackIsPlaying}
            onEnterWalkthrough={onTutorWalkthroughEnter}
            onExitWalkthrough={onTutorWalkthroughExit}
            onWalkthroughSelectStep={onTutorStepSelect}
            onWalkthroughPrevious={onTutorPlaybackPrevious}
            onWalkthroughNext={onTutorPlaybackNext}
            onWalkthroughPlay={onTutorPlaybackPlay}
            onWalkthroughPause={onTutorPlaybackPause}
            onWalkthroughReplay={onTutorPlaybackReplay}
            variant="workflow"
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111827] p-4">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {effectiveState === 'ready' ? (
          <TutorAssistReadyState
            isLoading={analysisLoading}
            onQuickAssist={() => requestAssist('simple')}
            onDeeperHelp={() => requestAssist('deep')}
            error={analysisError}
            onRetry={analysisError ? () => refreshAssist('simple') : null}
          />
        ) : null}
        {effectiveState === 'loading' ? <TutorAssistLoadingState /> : null}
        {effectiveState === 'simple' ? (
          <TutorAssistSimpleState
            summary={summary}
            onRefresh={() => refreshAssist('simple')}
            onUseReply={onUseReply}
            onGoDeeper={hasDeepAssistContent ? () => setViewState('deep') : undefined}
            onClose={handleClose}
            onUseStrongerModel={onUseStrongerModel ? () => onUseStrongerModel('quick') : undefined}
            boardActionContext={boardActionContext}
            onBoardAction={onBoardAction}
          />
        ) : null}
        {effectiveState === 'deep' ? (
          <TutorAssistDeepState
            privateNotes={privateNotes}
            onPrivateNotesChange={handlePrivateNotesChange}
            onRefresh={() => refreshAssist('deep')}
            onUseStrongerModel={onUseStrongerModel ? () => onUseStrongerModel('full') : undefined}
            summary={summary}
            onBack={() => setViewState('simple')}
            onClose={handleClose}
            boardActionContext={boardActionContext}
            onBoardAction={onBoardAction}
            evidenceText={evidenceText}
            detailedExplanation={detailedExplanation}
            solutionText={solutionText}
            stepCards={stepCards}
            validatorNotes={validatorNotes}
            walkthroughActive={tutorWalkthroughActive}
            activeWalkthroughStep={activeWalkthroughStep}
            activeWalkthroughEvidence={activeWalkthroughEvidence}
            walkthroughStepIds={walkthroughStepIds}
            walkthroughStepIndex={activeWalkthroughIndex}
            walkthroughStepCount={stepCards.length}
            canWalkthroughPlay={tutorPlaybackCanPlay}
            isWalkthroughPlaying={tutorPlaybackIsPlaying}
            onEnterWalkthrough={onTutorWalkthroughEnter}
            onExitWalkthrough={onTutorWalkthroughExit}
            onWalkthroughSelectStep={onTutorStepSelect}
            onWalkthroughPrevious={onTutorPlaybackPrevious}
            onWalkthroughNext={onTutorPlaybackNext}
            onWalkthroughPlay={onTutorPlaybackPlay}
            onWalkthroughPause={onTutorPlaybackPause}
            onWalkthroughReplay={onTutorPlaybackReplay}
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
  onSelectMode,
  preferredMode = 'quick',
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
  onSelectMode: (mode: TutorResponseMode) => void
  preferredMode?: TutorResponseMode
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
  const [selectedMode, setSelectedMode] = useState<TutorResponseMode>(preferredMode)
  const steps = useMemo(() => getWorkflowSteps(analysis, analysisResult), [analysis, analysisResult])
  const currentStep = useMemo(() => getCurrentWorkflowStep(steps), [steps])
  const misconception = useMemo(() => getLikelyMisconception(analysis, analysisResult, currentStep), [analysis, analysisResult, currentStep])
  const playbook = useMemo(() => buildNextMovePlaybook(analysis, analysisResult, currentStep), [analysis, analysisResult, currentStep])
  const solutionText = useMemo(() => getSolutionText(analysis, analysisResult), [analysis, analysisResult])
  const detailedExplanation = analysisResult?.overallSummary?.trim() || analysis?.sections?.stepsAnalysis?.trim() || ''
  const evidenceText = currentStep?.studentText || ''
  const hasSessionSummary = Boolean(sessionBadgeText || sessionSummaryText || sessionMetaText || sessionSubjectText || sessionGradeText || onPickUpSession || onPassSession)
  const diagnosisText = misconception || currentStep?.detail || 'Review the current step before responding.'
  const quickHelpReply = playbook.ask || playbook.hint || currentStep?.detail || diagnosisText
  const fullHelpReply = playbook.explain || detailedExplanation || playbook.hint || diagnosisText
  const modeCards = useMemo(() => (['quick', 'full'] as TutorResponseMode[]).map((mode) => buildTutorResponseModeCard({
    mode,
    diagnosis: diagnosisText,
    nextMove: quickHelpReply,
    fullHelp: fullHelpReply,
    solutionText,
    focusStep: currentStep,
  })), [currentStep, diagnosisText, fullHelpReply, quickHelpReply, solutionText])
  const selectedModeCard = modeCards.find((card) => card.id === selectedMode) ?? modeCards[0]

  useEffect(() => {
    setSelectedMode(preferredMode)
  }, [preferredMode])

  if (!analysis && !analysisResult) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full max-w-[420px] rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.98),rgba(15,23,42,0.96))] px-4 py-5 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Tutor Assist</div>
          <h2 className="mt-2 text-[20px] font-semibold text-[#F9FAFB]">Need help with this problem?</h2>
          <div className="mt-4 grid gap-3">
            {modeCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectMode(card.id)}
                className={`rounded-[14px] border px-4 py-3 text-left transition ${card.buttonClassName}`}
              >
                <div className="text-[15px] font-semibold">{card.label}</div>
                <div className="mt-1 text-[12px] leading-5 text-current/80">{card.summary}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-4 pb-6">
        {hasSessionSummary ? (
          <section className="rounded-[16px] border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Session header</div>
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

        <section className="rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(30,30,34,0.98),rgba(17,24,39,0.98))] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Diagnosis</div>
              <h2 className="mt-2 text-[18px] font-semibold leading-tight text-[#F9FAFB]">{diagnosisText}</h2>
              {currentStep?.title ? <p className="mt-2 text-[13px] leading-6 text-[#D1D5DB]">Current board focus: {currentStep.title}.</p> : null}
            </div>
            {currentStep?.tag ? <StepTag value={currentStep.tag} /> : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => currentStep && onBoardAction(currentStep.number, 'mark', 'diagnosis')}
              aria-pressed={currentStep ? isBoardActionActive(boardActionContext, 'diagnosis', 'mark', currentStep.number) : false}
              disabled={!currentStep}
              className={`inline-flex items-center gap-2 rounded-[12px] border px-3 py-2 text-[13px] font-semibold transition ${
                currentStep && isBoardActionActive(boardActionContext, 'diagnosis', 'mark', currentStep.number)
                  ? 'border-amber-300/60 bg-amber-500/20 text-amber-50 shadow-[0_0_0_1px_rgba(252,211,77,0.25),0_16px_30px_rgba(245,158,11,0.12)]'
                  : 'border-amber-400/25 bg-amber-500/12 text-amber-100 hover:border-amber-400/40 hover:bg-amber-500/16 disabled:cursor-not-allowed disabled:opacity-60'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Focus board here
            </button>
            <span className="text-[12px] text-[#9CA3AF]">One clear board move first. Deeper evidence stays below.</span>
          </div>
        </section>

        <section className="rounded-[18px] border border-white/10 bg-[#111827] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Mode selection</div>
          <h2 className="mt-2 text-[20px] font-semibold text-[#F9FAFB]">Choose the response style.</h2>
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {modeCards.map((card) => {
              const isSelected = selectedMode === card.id
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => {
                    setSelectedMode(card.id)
                    onSelectMode(card.id)
                  }}
                  aria-pressed={isSelected}
                  className={`rounded-[16px] border px-4 py-4 text-left transition ${card.buttonClassName} ${isSelected ? 'shadow-[0_18px_34px_rgba(0,0,0,0.22)] ring-1 ring-white/10' : ''}`}
                >
                  <div className={`text-[15px] font-semibold ${card.emphasisClassName}`}>{card.label}</div>
                  <div className="mt-2 text-[13px] leading-6 text-[#E5E7EB]">{card.summary}</div>
                </button>
              )
            })}
          </div>
        </section>

        <section className={`rounded-[18px] border px-4 py-4 shadow-[0_22px_40px_rgba(0,0,0,0.24)] ${selectedModeCard.panelClassName}`}>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#c9c4bb]">Action</div>
            <h2 className="mt-2 text-[22px] font-semibold text-[#F9FAFB]">{selectedModeCard.label}</h2>
          </div>

          <div className="mt-4 rounded-[16px] border border-white/10 bg-black/15 px-4 py-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">What to say</div>
            <p className="mt-3 text-[16px] leading-7 text-[#F9FAFB]">{selectedModeCard.detail}</p>
            {selectedModeCard.caution ? (
              <div className="mt-3 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] leading-5 text-[#D1D5DB]">
                {selectedModeCard.caution}
              </div>
            ) : null}
            {selectedMode === 'full' && hasVisibleText(playbook.checkUnderstanding) ? (
              <div className="mt-3 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] leading-5 text-[#D1D5DB]">
                Check next: {playbook.checkUnderstanding}
              </div>
            ) : null}
            {selectedMode === 'quick' && currentStep?.title ? (
              <div className="mt-3 text-[12px] leading-5 text-[#9CA3AF]">Keep the tutor on {currentStep.title.toLowerCase()} and move fast.</div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onUseReply(selectedModeCard.detail)}
              className="rounded-[12px] bg-[#F59E0B] px-4 py-2.5 text-[13px] font-semibold text-black transition hover:bg-[#f2ab28]"
            >
              {selectedModeCard.ctaLabel}
            </button>
            <button
              type="button"
              onClick={() => onOpenDetail('chat')}
              className="rounded-[12px] border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[13px] font-medium text-[#D1D5DB] transition hover:border-white/20 hover:text-[#F9FAFB]"
            >
              Open conversation
            </button>
          </div>
        </section>

        {steps.length > 0 ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setDetailsOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={detailsOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Supporting steps</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Collapsed by default so the response stays primary.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${detailsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {detailsOpen ? (
            <div className="border-t border-white/10 px-4 py-3">
              <div className="space-y-2">
                {steps.map((step) => {
                  const isActive = step.number === currentStep?.number
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
        ) : null}

        {evidenceText ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setEvidenceOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={evidenceOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Evidence from student work</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Keep the raw clue subordinate to the chosen response.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${evidenceOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {evidenceOpen ? <div className="border-t border-white/10 px-4 py-3 text-[13px] leading-6 text-[#D1D5DB]">{evidenceText}</div> : null}
        </section>
        ) : null}

        {solutionText ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setSolutionOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={solutionOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Reveal solution</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Hidden unless the tutor explicitly opens it.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${solutionOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {solutionOpen ? <div className="border-t border-white/10 px-4 py-3 text-[15px] font-semibold text-[#F9FAFB]">{solutionText}</div> : null}
        </section>
        ) : null}

        {detailedExplanation ? (
        <section className="rounded-[16px] border border-white/10 bg-white/[0.02]">
          <button type="button" onClick={() => setExplanationOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={explanationOpen}>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Detailed explanation</span>
              <span className="mt-1 block text-[13px] text-[#D1D5DB]">Use only when the tutor wants the longer rationale.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${explanationOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {explanationOpen ? <div className="border-t border-white/10 px-4 py-3 text-[13px] leading-6 text-[#D1D5DB]">{detailedExplanation}</div> : null}
        </section>
        ) : null}

        <div className="flex flex-wrap gap-2 px-1 text-[12px] text-[#9CA3AF]">
          <button type="button" onClick={() => onOpenDetail('steps')} className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 font-medium transition hover:border-white/20 hover:text-[#F9FAFB]">
            Open full steps
          </button>
        </div>
      </div>
    </div>
  )
}

void TutorAssistPanel
void TutorWorkflowOverview

const RightSidePanel: React.FC<RightSidePanelProps> = ({
  className = '',
  chatRoomId = null,
  initialTab = 'chat',
  activeTab,
  initialChatMessages,
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
  activeTutorStepId,
  tutorWalkthroughActive = false,
  overlayVisible = false,
  tutorPlaybackIsPlaying = false,
  onTutorWalkthroughEnter,
  onTutorWalkthroughExit,
  onToggleTutorOverlay,
  onTutorPlaybackPlay,
  onTutorPlaybackPause,
  onTutorPlaybackPrevious,
  onTutorPlaybackNext,
  onMarkStep,
  onBoardActionContextChange,
  onClearAnalysisReview,
  width = 'clamp(380px, 35vw, 560px)',
  onTabChange,
}) => {
  const requestedTab = useMemo(() => resolveVisibleTab(activeTab ?? initialTab), [activeTab, initialTab])
  const [detailTab, setDetailTab] = useState<VisibleTabId>(() => (requestedTab === 'steps' ? 'ai-tutor' : requestedTab))
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
  const primaryIssueStep = useMemo(() => getStructuredStep(resolvedAnalysisResult, primaryDiagnosisIssue), [resolvedAnalysisResult, primaryDiagnosisIssue])
  const problemText = useMemo(() => getProblemText(analysis, resolvedAnalysisResult), [analysis, resolvedAnalysisResult])
  const answerPairText = useMemo(() => getAnswerPairText(analysis, resolvedAnalysisResult), [analysis, resolvedAnalysisResult])
  const responseRecommendation = useMemo(
    () => buildResponseRecommendation(analysis, resolvedAnalysisResult, primaryDiagnosisIssue, primaryIssueStep),
    [analysis, resolvedAnalysisResult, primaryDiagnosisIssue, primaryIssueStep],
  )

  const resolvedWidth = typeof width === 'number' ? `${Math.max(width, 380)}px` : width

  const panelStyle: React.CSSProperties = {
    width: resolvedWidth,
    minWidth: '380px',
    backgroundColor: '#111827',
    fontFamily: '"DM Sans", sans-serif',
  }

  const handleDetailTabChange = (tabId: VisibleTabId) => {
    const nextTab = tabId === 'steps' ? 'ai-tutor' : tabId
    setDetailTab(nextTab)
    onTabChange?.(nextTab)
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
      setDetailTab(nextTab === 'steps' ? 'ai-tutor' : nextTab)
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

  const handleBoardAction = (stepNumber: number, mode: BoardActionMode, source: BoardActionSource) => {
    setBoardActionContext(createBoardActionContext(stepCards, stepNumber, mode, source))

    if (mode === 'mark') {
      onMarkStep?.(stepNumber)
    }
  }

  const renderPanelContent = (tabId: VisibleTabId): React.JSX.Element => {
    if (tabId === 'chat') {
      if (chatRoomId) {
        return (
          <div className="min-h-0 flex-1 overflow-hidden rounded-[16px] border border-white/10 bg-white shadow-[0_18px_36px_rgba(0,0,0,0.18)]">
            <ChatWindow roomId={chatRoomId} mode="conversation" />
          </div>
        )
      }

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
          focusStepNumber={primaryDiagnosisIssue?.number ?? 1}
        />
      )
    }

    if (tabId === 'steps') {
      return (
        <StepsPanel
          boardActionContext={boardActionContext}
          onBoardAction={handleBoardAction}
          onStartAnalysis={() => onStartAnalysis('quick')}
          onRetryAnalysis={() => onRetryAnalysis('quick')}
          analysisLoading={analysisLoading}
          analysisPendingConfirmation={analysisPendingConfirmation}
          analysisSourceLabel={analysisSourceLabel}
          stepCards={stepCards}
          primaryDiagnosisIssue={primaryDiagnosisIssue}
          problemText={problemText}
          answerPairText={answerPairText}
        />
      )
    }

    if (tabId === 'ai-tutor') {
      return (
        <AIReviewPanel
          analysis={analysis}
          analysisResult={resolvedAnalysisResult}
          analysisLoading={analysisLoading}
          analysisPendingConfirmation={analysisPendingConfirmation}
          onStartAnalysis={onStartAnalysis}
          onRetryAnalysis={onRetryAnalysis}
          overlayVisible={overlayVisible}
          tutorWalkthroughActive={tutorWalkthroughActive}
          tutorPlaybackIsPlaying={tutorPlaybackIsPlaying}
          activeTutorStepId={activeTutorStepId}
          onToggleTutorOverlay={onToggleTutorOverlay}
          onTutorWalkthroughEnter={onTutorWalkthroughEnter}
          onTutorWalkthroughExit={onTutorWalkthroughExit}
          onTutorPlaybackPause={onTutorPlaybackPause}
          onTutorPlaybackPlay={onTutorPlaybackPlay}
          onTutorPlaybackPrevious={onTutorPlaybackPrevious}
          onTutorPlaybackNext={onTutorPlaybackNext}
          onClearAnalysisReview={onClearAnalysisReview}
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
          {chatRoomId ? (
            <section className="h-full min-h-0 p-4">
              <div className="h-full overflow-hidden rounded-[16px] border border-white/10 bg-white shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
                <ChatWindow roomId={chatRoomId} mode="conversation" />
              </div>
            </section>
          ) : (
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
          )}
        </div>
      ) : (
      <>
      <div className="shrink-0 border-b border-[#374151] bg-[linear-gradient(180deg,rgba(31,41,55,0.96),rgba(17,24,39,0.98))] px-4 py-3">
        <div className="space-y-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8f867d]">Tutor sidebar</div>
            <div className="mt-1 text-[14px] text-[#9CA3AF]">Chat by default. Review when you need a quick read on the work.</div>
          </div>

          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Tutor sidebar views">
            {PRIMARY_TABS.map((section) => {
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
              onClick={() => onRetryAnalysis('quick')}
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
        <section className="h-full min-h-0 p-4">
          <div className="h-full overflow-hidden rounded-[16px] border border-white/10 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
            {renderPanelContent(detailTab)}
          </div>
        </section>
      </div>
      </>
      )}
    </aside>
  )
}

export default RightSidePanel
