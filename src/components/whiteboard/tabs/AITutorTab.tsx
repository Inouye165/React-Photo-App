import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Edit3, Sparkles } from 'lucide-react'
import type { TutorStepStatus, WhiteboardTutorResponse } from '../../../types/whiteboard'
import { formatTutorRichText } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export type TutorLessonMessage = {
  title: string
  body: string
  tone: 'assistant' | 'canvas' | 'prompt'
}

export interface AITutorTabProps {
  className?: string
  hasPhoto: boolean
  hasBoardContent?: boolean
  hasInput?: boolean
  inputMode?: 'photo' | 'text'
  problemDraft?: string
  helpRequestDraft?: string
  onHelpRequestDraftChange?: (value: string) => void
  onProblemDraftChange?: (value: string) => void
  analysis: WhiteboardTutorResponse | null
  analysisMode?: 'quick' | 'full' | null
  isLoading: boolean
  error: string | null
  onStartAnalysis: (mode: 'quick' | 'full') => void
  onRetryAnalysis: (mode: 'quick' | 'full') => void
  responseAge: string
  responseAgeInvalid: boolean
  onResponseAgeChange: (value: string) => void
  followUpDraft: string
  isSubmitting: boolean
  onFollowUpDraftChange: (value: string) => void
  onSubmitFollowUp: () => void
  onLessonMessageChange?: (message: TutorLessonMessage | null) => void
  assistContextKey?: string | null
  onUseStrongerModel?: (mode: 'quick' | 'full') => void
  walkthroughActive?: boolean
  activeWalkthroughStepId?: string | null
  canWalkthroughPlay?: boolean
  isWalkthroughPlaying?: boolean
  onEnterWalkthrough?: () => void
  onExitWalkthrough?: () => void
  onWalkthroughSelectStep?: (stepId: string | null) => void
  onWalkthroughPrevious?: () => void
  onWalkthroughNext?: () => void
  onWalkthroughPlay?: () => void
  onWalkthroughPause?: () => void
  onWalkthroughReplay?: () => void
}

type StepViewModel = {
  id: string
  title: string
  detail: string
  status?: TutorStepStatus | 'neutral'
}

type TutorAssistMode = 'ready' | 'loading' | 'quick' | 'full'
type TutorAssistRequestMode = 'quick' | 'full'

function hasVisibleText(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function getQuestionText(analysis: WhiteboardTutorResponse | null): string {
  if (!analysis) return ''
  return analysis.analysisResult?.problemText?.trim() || analysis.sections.problem?.trim() || analysis.problem?.trim() || ''
}

function getSteps(analysis: WhiteboardTutorResponse | null): StepViewModel[] {
  if (!analysis) return []

  const structuredSteps = analysis.analysisResult?.steps ?? []
  return structuredSteps
    .map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      title: step.shortLabel?.trim() || '',
      detail: step.kidFriendlyExplanation?.trim() || step.correction?.trim() || step.hint?.trim() || '',
      status: step.status,
    }))
    .filter((step) => hasVisibleText(step.title) || hasVisibleText(step.detail))
}

function getSolution(analysis: WhiteboardTutorResponse | null): string {
  if (!analysis) return ''
  return analysis.analysisResult?.finalAnswers?.filter(Boolean).join(', ').trim() || analysis.correctSolution?.trim() || ''
}

function getPrimaryInsight(analysis: WhiteboardTutorResponse | null): TutorLessonMessage | null {
  if (!analysis) return null

  const firstIncorrect = analysis.analysisResult?.steps?.find((step) => step.status === 'incorrect' || step.status === 'partial' || step.status === 'warning')
  if (firstIncorrect && (hasVisibleText(firstIncorrect.shortLabel) || hasVisibleText(firstIncorrect.kidFriendlyExplanation) || hasVisibleText(firstIncorrect.correction) || hasVisibleText(firstIncorrect.hint))) {
    return {
      title: firstIncorrect.shortLabel?.trim() || firstIncorrect.studentText?.trim() || firstIncorrect.normalizedMath?.trim() || '',
      body: firstIncorrect.kidFriendlyExplanation?.trim() || firstIncorrect.correction?.trim() || firstIncorrect.hint?.trim() || '',
      tone: 'assistant',
    }
  }

  return null
}

function getLikelyIssue(analysis: WhiteboardTutorResponse | null): string | null {
  const firstIncorrect = analysis?.analysisResult?.steps?.find((step) => step.status !== 'correct')
  return firstIncorrect?.correction?.trim() || firstIncorrect?.kidFriendlyExplanation?.trim() || firstIncorrect?.shortLabel?.trim() || null
}

function getSuggestedReply(analysis: WhiteboardTutorResponse | null): string | null {
  const firstIncorrect = analysis?.analysisResult?.steps?.find((step) => step.status !== 'correct')
  return firstIncorrect?.hint?.trim() || null
}

function getEvidenceText(analysis: WhiteboardTutorResponse | null): string {
  const firstIncorrect = analysis?.analysisResult?.steps?.find((step) => step.status !== 'correct')
  return firstIncorrect?.studentText?.trim() || firstIncorrect?.normalizedMath?.trim() || ''
}

function getConfidenceLabel(analysis: WhiteboardTutorResponse | null): { label: string; detail: string } | null {
  void analysis
  return null
}

function getModelSummary(analysis: WhiteboardTutorResponse | null): { label: string; detail: string | null; strongerAvailable: boolean; isStronger: boolean } | null {
  const metadata = analysis?.modelMetadata
  if (!metadata) {
    return null
  }

  const label = metadata.evaluationModel || metadata.transcriptionModel || ''
  if (!label) {
    return null
  }

  return {
    label,
    detail: metadata.transcriptionModel && metadata.evaluationModel ? `Photo read: ${metadata.transcriptionModel}` : null,
    strongerAvailable: metadata.strongerModelAvailable,
    isStronger: metadata.tier === 'stronger',
  }
}

function statusClasses(status?: TutorStepStatus | 'neutral'): string {
  if (status === 'correct') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
  if (status === 'incorrect') return 'border-red-400/30 bg-red-500/10 text-red-200'
  if (status === 'partial') return 'border-amber-400/30 bg-amber-500/10 text-amber-200'
  if (status === 'warning') return 'border-sky-400/30 bg-sky-500/10 text-sky-200'
  return 'border-white/10 bg-white/[0.03] text-[#c6b4a4]'
}

function statusLabel(status?: TutorStepStatus | 'neutral'): string {
  if (!status || status === 'neutral') return 'Step'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function SectionTitle({ title }: { title: string }): React.JSX.Element {
  return <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">{title}</h3>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  return <section className={`rounded-[10px] border border-white/10 bg-white/[0.03] p-4 ${className}`}>{children}</section>
}

function RichText({ value, className = '' }: { value: string; className?: string }): React.JSX.Element {
  return <div className={`text-[14px] leading-[1.6] text-[#F0EDE8] ${className}`} dangerouslySetInnerHTML={{ __html: formatTutorRichText(value) }} />
}

const AITutorTab: React.FC<AITutorTabProps> = ({
  className = '',
  hasPhoto,
  hasInput,
  inputMode = 'photo',
  problemDraft = '',
  analysis,
  analysisMode = null,
  isLoading,
  error,
  onStartAnalysis,
  onRetryAnalysis,
  responseAgeInvalid,
  onProblemDraftChange,
  onFollowUpDraftChange,
  onLessonMessageChange,
  assistContextKey = null,
  onUseStrongerModel,
  walkthroughActive = false,
  activeWalkthroughStepId = null,
  canWalkthroughPlay = false,
  isWalkthroughPlaying = false,
  onEnterWalkthrough,
  onExitWalkthrough,
  onWalkthroughSelectStep,
  onWalkthroughPrevious,
  onWalkthroughNext,
  onWalkthroughPlay,
  onWalkthroughPause,
  onWalkthroughReplay,
}) => {
  const parsedQuestion = useMemo(() => getQuestionText(analysis), [analysis])
  const [questionDraft, setQuestionDraft] = useState(problemDraft || parsedQuestion)
  const [assistMode, setAssistMode] = useState<TutorAssistMode>('ready')
  const [pendingLoadTargetMode, setPendingLoadTargetMode] = useState<TutorAssistRequestMode>('quick')
  const sawExternalLoadingRef = useRef(false)
  const [editingQuestion, setEditingQuestion] = useState(false)
  const [problemOpen, setProblemOpen] = useState(false)
  const [solutionOpen, setSolutionOpen] = useState(false)
  const steps = useMemo(() => getSteps(analysis), [analysis])
  const activeWalkthroughIndex = useMemo(() => steps.findIndex((step) => step.id === activeWalkthroughStepId), [activeWalkthroughStepId, steps])
  const activeWalkthroughStep = useMemo(() => (activeWalkthroughIndex >= 0 ? steps[activeWalkthroughIndex] ?? null : null), [activeWalkthroughIndex, steps])
  const solution = useMemo(() => getSolution(analysis), [analysis])
  const likelyIssue = useMemo(() => getLikelyIssue(analysis), [analysis])
  const suggestedReply = useMemo(() => getSuggestedReply(analysis), [analysis])
  const evidenceText = useMemo(() => getEvidenceText(analysis), [analysis])
  const confidence = useMemo(() => getConfidenceLabel(analysis), [analysis])
  const modelSummary = useMemo(() => getModelSummary(analysis), [analysis])
  const canUseStrongerModel = Boolean(onUseStrongerModel && modelSummary && modelSummary.strongerAvailable && !modelSummary.isStronger)
  const canRequestHelp = Boolean(hasPhoto || hasInput || questionDraft.trim()) && !responseAgeInvalid
  const hasDeepAssistContent = Boolean(
    steps.length > 0
    || solution
    || evidenceText
    || analysis?.analysisResult?.overallSummary?.trim()
  )

  useEffect(() => {
    const next = problemDraft.trim() || parsedQuestion
    setQuestionDraft(next)
  }, [parsedQuestion, problemDraft])

  useEffect(() => {
    if (assistMode === 'ready') {
      onLessonMessageChange?.(null)
      return
    }

    onLessonMessageChange?.(getPrimaryInsight(analysis))
  }, [analysis, assistMode, onLessonMessageChange])

  useEffect(() => {
    if (isLoading) {
      sawExternalLoadingRef.current = true
      return
    }

    if (assistMode === 'loading' && (sawExternalLoadingRef.current || analysis || error)) {
      setAssistMode(analysis ? pendingLoadTargetMode : 'ready')
      sawExternalLoadingRef.current = false
    }
  }, [analysis, assistMode, error, isLoading, pendingLoadTargetMode])

  useEffect(() => {
    setAssistMode('ready')
    setPendingLoadTargetMode('quick')
    onLessonMessageChange?.(null)
    sawExternalLoadingRef.current = false
  }, [assistContextKey, onLessonMessageChange])

  useEffect(() => {
    if (assistMode === 'full' && !hasDeepAssistContent) {
      setAssistMode('quick')
    }
  }, [assistMode, hasDeepAssistContent])

  const handleQuestionChange = (value: string) => {
    setQuestionDraft(value)
    onProblemDraftChange?.(value)
  }

  const requestAssist = (mode: TutorAssistRequestMode) => {
    setPendingLoadTargetMode(mode)

    if (analysis && analysisMode === mode) {
      setAssistMode(mode)
      return
    }

    onStartAnalysis(mode)
    setAssistMode('loading')
  }

  const refreshAssist = (mode: TutorAssistRequestMode = assistMode === 'full' ? 'full' : 'quick') => {
    setPendingLoadTargetMode(mode)
    onRetryAnalysis(mode)
    setAssistMode('loading')
  }

  const closeAssist = () => {
    setAssistMode('ready')
    onExitWalkthrough?.()
  }

  return (
    <div className={`flex h-full min-h-0 flex-col bg-[#1c1c1e] text-[#F0EDE8] ${className}`}>
      <PanelScrollArea className="flex-1" contentClassName="h-full px-4 py-4 pb-28">
        <div className="space-y-4 pb-4">
          <Card className="border-amber-400/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(255,255,255,0.03))]">
            <SectionTitle title="Tutor Assist" />
            <p className="mt-2 text-[14px] leading-[1.6] text-[#d8cfc4]">
              {analysis
                ? 'Need help with this problem?'
                : 'Need help with this problem?'}
            </p>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={() => requestAssist('quick')}
                disabled={isLoading || !canRequestHelp}
                className={`rounded-[12px] border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${assistMode === 'quick' ? 'border-amber-300/55 bg-amber-500/16' : 'border-amber-300/35 bg-amber-500/12 hover:border-amber-300/55 hover:bg-amber-500/16'}`}
              >
                <div className="text-[14px] font-semibold text-[#F0EDE8]">Quick help</div>
                <div className="mt-1 text-[12px] leading-5 text-[#d8cfc4]">See the mistake and the correct answer fast.</div>
              </button>
              <button
                type="button"
                onClick={() => requestAssist('full')}
                disabled={isLoading || !canRequestHelp}
                className={`rounded-[12px] border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${assistMode === 'full' ? 'border-sky-300/40 bg-sky-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'}`}
              >
                <div className="text-[14px] font-semibold text-[#F0EDE8]">Full help</div>
                <div className="mt-1 text-[12px] leading-5 text-[#d8cfc4]">Get a full explanation, worked steps, and teaching tips.</div>
              </button>
            </div>
            {assistMode !== 'ready' && analysis ? (
              <p className="mt-3 text-[12px] leading-[1.6] text-[#8f867d]">
                {assistMode === 'quick'
                  ? 'Start with the mistake, the answer, and one short line to say.'
                  : 'Use the full explanation only when you want the extra teaching support.'}
              </p>
            ) : null}
          </Card>

          {assistMode !== 'ready' || analysis ? (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <SectionTitle title="Problem" />
                <p className="mt-1 text-[12px] leading-[1.45] text-[#8f867d]">
                  {analysis
                    ? 'Keep the full problem tucked away unless you need to verify the read.'
                    : inputMode === 'photo'
                      ? 'Usually this will be filled from the photo after AI help runs.'
                      : 'Type the problem here before requesting AI help.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuestion((current) => !current)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#c6b4a4] transition hover:border-amber-400/40 hover:text-[#F0EDE8]"
                aria-label={editingQuestion ? 'Stop editing problem' : 'Edit problem'}
                title={editingQuestion ? 'Stop editing problem' : 'Edit problem'}
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>

            {editingQuestion ? (
              <textarea
                aria-label="Problem or question"
                value={questionDraft}
                onChange={(event) => handleQuestionChange(event.target.value)}
                rows={3}
                className="mt-3 w-full resize-none rounded-[8px] border border-white/10 bg-black/15 px-3 py-2 text-[14px] text-[#F0EDE8] outline-none transition focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(201,130,43,0.16)] placeholder:text-[#c6b4a4]"
                placeholder="Example: Solve for x: 5x - 17 = 18"
              />
            ) : (
              <div className="mt-3 rounded-[8px] border border-white/10 bg-black/15 px-3 py-3 text-[16px] leading-[1.6] text-[#F0EDE8]">
                {questionDraft.trim() || 'No problem statement yet. Use AI help to read the photo, or edit this if needed.'}
              </div>
            )}
          </Card>
          ) : null}

            {isLoading ? (
            <Card>
              <div className="flex items-center gap-3 text-[14px] text-[#F0EDE8]">
                <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-amber-300" />
                Generating the next tutor move…
              </div>
            </Card>
          ) : null}

            {!isLoading && error && assistMode === 'ready' ? (
            <Card className="border-red-500/30 bg-red-500/10">
                <SectionTitle title="Assist request failed" />
              <p className="mt-2 text-[14px] leading-[1.6] text-red-100/90">{error}</p>
              <button
                type="button"
                onClick={() => onRetryAnalysis('quick')}
                className="mt-3 rounded-[8px] border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-white/15"
              >
                Retry
              </button>
            </Card>
          ) : null}

          {assistMode === 'quick' && analysis ? (
            <>
              <Card className="border-amber-400/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(255,255,255,0.03))]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SectionTitle title="Quick help" />
                    <p className="mt-2 text-[14px] leading-[1.6] text-[#d8cfc4]">Mistake first. Correct answer next. One short line to say.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => refreshAssist('quick')}
                    className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                  >
                    Refresh
                  </button>
                </div>
                {(modelSummary || confidence || canUseStrongerModel) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {modelSummary ? (
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-[#F0EDE8]">
                        Model: {modelSummary.label}
                      </span>
                    ) : null}
                    {modelSummary?.isStronger ? (
                      <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100">
                        Stronger model used
                      </span>
                    ) : null}
                    {canUseStrongerModel ? (
                      <button
                        type="button"
                        onClick={() => onUseStrongerModel?.('quick')}
                        className="rounded-full border border-amber-300/25 bg-amber-500/12 px-3 py-1 text-[11px] font-semibold text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-500/18"
                      >
                        Use stronger model
                      </button>
                    ) : null}
                    {modelSummary?.detail ? <p className="basis-full text-[12px] leading-[1.6] text-[#8f867d]">{modelSummary.detail}</p> : null}
                  </div>
                ) : null}
              </Card>

              {likelyIssue ? (
                <Card>
                  <SectionTitle title="Diagnosis" />
                  <p className="mt-3 text-[16px] font-semibold leading-[1.5] text-[#F0EDE8]">{likelyIssue}</p>
                </Card>
              ) : null}

              {suggestedReply ? (
                <Card className="border-sky-400/20 bg-sky-500/5">
                  <SectionTitle title="What to say" />
                  <div className="mt-3 flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 text-sky-300" />
                    <div className="flex-1">
                      <div className="text-[15px] leading-[1.6] text-[#F0EDE8]">{suggestedReply}</div>
                      <button
                        type="button"
                        onClick={() => onFollowUpDraftChange(suggestedReply)}
                        className="mt-3 rounded-[8px] bg-amber-500 px-3 py-2 text-[13px] font-semibold text-slate-950 transition hover:bg-amber-400"
                      >
                        Use this reply in chat
                      </button>
                    </div>
                  </div>
                </Card>
              ) : null}

              {evidenceText ? (
                <Card className="border-amber-400/20 bg-amber-500/10">
                  <SectionTitle title="Board focus" />
                  <p className="mt-2 text-[14px] font-semibold leading-[1.5] text-[#F0EDE8]">Center on the likely issue before going deeper.</p>
                  <p className="mt-2 text-[12px] leading-[1.6] text-amber-100/85">{evidenceText}</p>
                </Card>
              ) : null}

              <Card>
                <div className="flex flex-wrap gap-2">
                  {hasDeepAssistContent ? (
                    <button
                      type="button"
                      onClick={() => setAssistMode('full')}
                      className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                    >
                      Switch to full help
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeAssist}
                    className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                  >
                    Close
                  </button>
                </div>
              </Card>
            </>
          ) : null}

          {assistMode === 'full' && analysis ? (
            <>
              <Card className="border-amber-400/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(255,255,255,0.03))]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SectionTitle title="Full help" />
                    <p className="mt-2 text-[14px] leading-[1.6] text-[#d8cfc4]">Full explanation, worked steps, and teaching support when you want the whole toolkit.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => refreshAssist('full')}
                    className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAssistMode('quick')}
                    className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                  >
                    Switch to quick help
                  </button>
                  <button
                    type="button"
                    onClick={closeAssist}
                    className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                  >
                    Close
                  </button>
                </div>
              </Card>

              {likelyIssue ? (
                <Card>
                  <SectionTitle title="Misconception watchout" />
                  <p className="mt-3 text-[16px] font-semibold leading-[1.5] text-[#F0EDE8]">{likelyIssue}</p>
                </Card>
              ) : null}

              {suggestedReply ? (
                <Card className="border-sky-400/20 bg-sky-500/5">
                  <SectionTitle title="Coaching tip" />
                  <div className="mt-3 flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 text-sky-300" />
                    <div className="flex-1">
                      <div className="text-[15px] leading-[1.6] text-[#F0EDE8]">{suggestedReply}</div>
                      <button
                        type="button"
                        onClick={() => onFollowUpDraftChange(suggestedReply)}
                        className="mt-3 rounded-[8px] bg-amber-500 px-3 py-2 text-[13px] font-semibold text-slate-950 transition hover:bg-amber-400"
                      >
                        Use this reply in chat
                      </button>
                    </div>
                  </div>
                </Card>
              ) : null}

              {(steps.length > 0 || solution || analysis.analysisResult?.overallSummary) ? (
                <Card>
                  <SectionTitle title="Worked solution" />
                  {solution ? <div className="mt-3 text-[18px] font-semibold text-[#F0EDE8]">{solution}</div> : null}
                  {analysis.analysisResult?.overallSummary ? (
                    <RichText value={analysis.analysisResult.overallSummary} className="mt-3 text-[#d8cfc4]" />
                  ) : null}
                </Card>
              ) : null}

              {evidenceText ? (
                <Card className="border-amber-400/20 bg-amber-500/10">
                  <SectionTitle title="Suggested checkpoint question" />
                  <p className="mt-2 text-[12px] leading-[1.6] text-amber-100/85">{evidenceText}</p>
                </Card>
              ) : null}

              {(walkthroughActive || steps.length > 0) ? (
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SectionTitle title="Walkthrough" />
                      <p className="mt-1 text-[12px] leading-[1.45] text-[#8f867d]">
                        {walkthroughActive ? 'One current step at a time. The overlay should follow only while walkthrough is active.' : 'Open the guided sequence only when you want step-by-step support.'}
                      </p>
                    </div>
                    {walkthroughActive ? (
                      <button
                        type="button"
                        onClick={onExitWalkthrough}
                        className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                      >
                        Exit walkthrough
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onEnterWalkthrough}
                        disabled={steps.length === 0}
                        className="rounded-[8px] border border-amber-300/25 bg-amber-500/12 px-3 py-2 text-[12px] font-semibold text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-500/18 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Walk me through it
                      </button>
                    )}
                  </div>

                  {walkthroughActive && activeWalkthroughStep ? (
                    <div className="mt-3 space-y-3">
                      <article className="rounded-[10px] border border-amber-400/25 bg-amber-500/10 px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[14px] font-semibold text-[#F0EDE8]">
                            Step {activeWalkthroughIndex + 1}. {activeWalkthroughStep.title}
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusClasses(activeWalkthroughStep.status)}`}>
                            {statusLabel(activeWalkthroughStep.status)}
                          </span>
                        </div>
                        {activeWalkthroughStep.detail ? <RichText value={activeWalkthroughStep.detail} className="mt-2 text-[#d8cfc4]" /> : null}
                        {analysis?.analysisResult?.steps?.[activeWalkthroughIndex]?.studentText ? (
                          <div className="mt-3 rounded-[8px] border border-white/10 bg-black/15 px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Active evidence</div>
                            <p className="mt-1 text-[13px] leading-[1.5] text-[#F0EDE8]">{analysis.analysisResult.steps[activeWalkthroughIndex]?.studentText}</p>
                          </div>
                        ) : null}
                      </article>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={onWalkthroughPrevious}
                          className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={isWalkthroughPlaying ? onWalkthroughPause : onWalkthroughPlay}
                          disabled={!canWalkthroughPlay}
                          className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isWalkthroughPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button
                          type="button"
                          onClick={onWalkthroughNext}
                          className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                        >
                          Next
                        </button>
                        <button
                          type="button"
                          onClick={onWalkthroughReplay}
                          disabled={steps.length === 0}
                          className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Replay
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!walkthroughActive && steps.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {steps.map((step, index) => (
                        <article key={step.id} className="rounded-[10px] border border-white/10 bg-black/15 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[14px] font-semibold text-[#F0EDE8]">{index + 1}. {step.title}</div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusClasses(step.status)}`}>
                              {statusLabel(step.status)}
                            </span>
                          </div>
                          {step.detail ? <RichText value={step.detail} className="mt-2 text-[#d8cfc4]" /> : null}
                          <button
                            type="button"
                            onClick={() => {
                              onEnterWalkthrough?.()
                              onWalkthroughSelectStep?.(step.id)
                            }}
                            className="mt-3 rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8] transition hover:border-white/20"
                          >
                            Start here
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </Card>
              ) : null}

              {evidenceText ? (
                <Card>
                  <SectionTitle title="Evidence from student work" />
                  <p className="mt-3 text-[14px] leading-[1.6] text-[#F0EDE8]">{evidenceText}</p>
                </Card>
              ) : null}

              {questionDraft.trim() ? (
                <Card>
                  <button type="button" onClick={() => setProblemOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={problemOpen}>
                    <div>
                      <SectionTitle title="Problem" />
                      <p className="mt-1 text-[12px] leading-[1.45] text-[#8f867d]">Open the full interpreted prompt only when you need to verify it.</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-[#8f867d] transition ${problemOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {problemOpen ? <div className="mt-3 rounded-[8px] border border-white/10 bg-black/15 px-3 py-3 text-[15px] leading-[1.6] text-[#F0EDE8]">{questionDraft.trim()}</div> : null}
                </Card>
              ) : null}

              {solution ? (
                <Card className="border-emerald-400/20 bg-emerald-500/5">
                  <button type="button" onClick={() => setSolutionOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={solutionOpen}>
                    <div>
                      <SectionTitle title="Reveal solution" />
                      <p className="mt-1 text-[12px] leading-[1.45] text-[#8f867d]">Keep the answer hidden until it is actually needed.</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-[#8f867d] transition ${solutionOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {solutionOpen ? (
                    <div className="mt-3 flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                      <div>
                        <div className="text-[18px] font-semibold text-[#F0EDE8]">{solution}</div>
                        {analysis.analysisResult?.overallSummary ? (
                          <RichText value={analysis.analysisResult.overallSummary} className="mt-2 text-[#d8cfc4]" />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </Card>
              ) : null}

              {analysis.analysisResult?.overallSummary ? (
                <Card>
                  <SectionTitle title="Worked steps" />
                  <RichText value={analysis.analysisResult.overallSummary} className="mt-3 text-[#d8cfc4]" />
                </Card>
              ) : null}
            </>
          ) : null}
        </div>
      </PanelScrollArea>
    </div>
  )
}

export default AITutorTab
