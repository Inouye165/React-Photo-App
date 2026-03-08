import React, { useEffect, useRef, useState } from 'react'
import { SendHorizonal } from 'lucide-react'
import type { WhiteboardTutorResponse } from '../../../types/whiteboard'
import { formatTutorRichText, parseTutorListItems } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export type TutorLessonMessage = {
  title: string
  body: string
  tone: 'assistant' | 'canvas' | 'prompt'
}

export interface AITutorTabProps {
  className?: string
  hasPhoto: boolean
  hasInput?: boolean
  inputMode?: 'photo' | 'text'
  problemDraft?: string
  onProblemDraftChange?: (value: string) => void
  analysis: WhiteboardTutorResponse | null
  isLoading: boolean
  error: string | null
  onStartAnalysis: () => void
  onRetryAnalysis: () => void
  responseAge: string
  responseAgeInvalid: boolean
  onResponseAgeChange: (value: string) => void
  followUpDraft: string
  isSubmitting: boolean
  onFollowUpDraftChange: (value: string) => void
  onSubmitFollowUp: () => void
  onLessonMessageChange?: (message: TutorLessonMessage | null) => void
}

type GuidedTutorState =
  | 'idle'
  | 'awaiting_problem'
  | 'awaiting_student_attempt'
  | 'evaluating_attempt'
  | 'hint_shown'
  | 'first_step_shown'
  | 'next_step_shown'
  | 'solved'
  | 'similar_question_ready'

type GuidedTutorMessage = {
  id: string
  title: string
  body: string
  tone: 'assistant' | 'canvas' | 'prompt'
}

function toLessonMessage(message: GuidedTutorMessage): TutorLessonMessage {
  return {
    title: message.title,
    body: message.body,
    tone: message.tone,
  }
}

function truncateText(value: string, limit = 120): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit - 1).trimEnd()}…`
}

function toSentenceCase(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

function getProblemSummary(analysis: WhiteboardTutorResponse | null): string {
  if (!analysis) return ''
  return analysis.sections.problem.trim() || analysis.problem.trim()
}

function getFirstHint(analysis: WhiteboardTutorResponse): string {
  const firstStep = analysis.steps[0]
  if (firstStep?.explanation.trim()) {
    return `Start by thinking about ${toSentenceCase(firstStep.label)}. ${firstStep.explanation.trim()}`
  }

  if (firstStep?.label.trim()) {
    return `Start by thinking about ${toSentenceCase(firstStep.label)} before you calculate anything else.`
  }

  const fallbackItem = parseTutorListItems(analysis.sections.stepsAnalysis)[0]
  if (fallbackItem) {
    return fallbackItem
  }

  return 'Look closely at what the question is asking you to find, then write one small step that moves you closer to that answer.'
}

function getNextAction(analysis: WhiteboardTutorResponse): string {
  const firstError = analysis.errorsFound[0]
  if (firstError?.correction.trim()) {
    return `Next action: revisit step ${firstError.stepNumber} and ${toSentenceCase(firstError.correction)}.`
  }

  const firstStep = analysis.steps[0]
  if (firstStep?.label.trim()) {
    return `Next action: write out ${toSentenceCase(firstStep.label)} on your own paper before asking for the next step.`
  }

  return 'Next action: write one sentence explaining what quantity you are trying to find.'
}

function buildAnalysisOverviewMessage(analysis: WhiteboardTutorResponse): GuidedTutorMessage {
  const summary = analysis.closingEncouragement.trim() || analysis.sections.encouragement.trim() || 'I read the problem and I am ready to help you step by step.'
  const firstHint = getFirstHint(analysis)

  return {
    id: 'analysis-overview',
    title: 'Here is the lesson plan',
    body: [
      `Summary: ${summary}`,
      `Start here: ${firstHint}`,
      'Type your attempt in Student Work, then use Check my work or ask for a hint.',
    ].join('\n\n'),
    tone: 'prompt',
  }
}

function buildEvaluationMessage(studentWork: string, analysis: WhiteboardTutorResponse): GuidedTutorMessage {
  const firstLine = studentWork
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? 'your first step'

  const encouragement = analysis.closingEncouragement.trim() || analysis.sections.encouragement.trim() || 'You started, and that matters.'

  return {
    id: `evaluation-${studentWork.length}`,
    title: 'Here’s what I notice',
    body: [
      `Encouragement: ${encouragement}`,
      `Observation: I can see you started with "${truncateText(firstLine)}".` ,
      getNextAction(analysis),
    ].join('\n\n'),
    tone: 'assistant',
  }
}

function buildHintMessage(analysis: WhiteboardTutorResponse): GuidedTutorMessage {
  return {
    id: 'hint',
    title: 'Hint',
    body: `${getFirstHint(analysis)}\n\nTry that much first, then check your work or ask for step 1 if you still want a nudge.`,
    tone: 'assistant',
  }
}

function buildStepMessage(stepNumber: number, analysis: WhiteboardTutorResponse): GuidedTutorMessage {
  const step = analysis.steps[stepNumber - 1]
  if (!step) {
    return {
      id: `step-${stepNumber}-fallback`,
      title: `Step ${stepNumber}`,
      body: 'That step is not available yet. Try asking for a hint first.',
      tone: 'assistant',
    }
  }

  return {
    id: `step-${stepNumber}`,
    title: `Step ${stepNumber}`,
    body: `${step.label}\n\n${step.explanation}\n\nStep ${stepNumber} ready to show on canvas.`,
    tone: 'canvas',
  }
}

function buildSimilarQuestion(problem: string): string {
  const trimmed = problem.trim()
  if (!trimmed) {
    return 'Try a similar question with different numbers but the same first step.'
  }

  let replacements = 0
  const nextProblem = trimmed.replace(/\d+/g, (match) => {
    replacements += 1
    return String(Number(match) + (replacements === 1 ? 1 : 2))
  })

  if (replacements > 0 && nextProblem !== trimmed) {
    return nextProblem
  }

  return `${trimmed} Then change one number or condition and solve it again using the same first step.`
}

function TutorStatus({ state, hasStudentWork }: { state: GuidedTutorState; hasStudentWork: boolean }): React.JSX.Element {
  const copy: Record<GuidedTutorState, { label: string; body: string }> = {
    idle: {
      label: 'Ready to analyze',
      body: 'Start by analyzing the problem so the tutor can guide you step by step.',
    },
    awaiting_problem: {
      label: 'Awaiting problem',
      body: 'Add a problem or photo first so the tutor has something to work with.',
    },
    awaiting_student_attempt: {
      label: hasStudentWork ? 'Ready to check your work' : 'Ready to guide you',
      body: hasStudentWork
        ? 'Use Check my work for feedback on your attempt.'
        : 'If you have not tried it yet, start with a hint instead of jumping to the answer.',
    },
    evaluating_attempt: {
      label: 'Work checked',
      body: 'Use the next action, then reveal step 1 only if you still need it.',
    },
    hint_shown: {
      label: 'Hint shown',
      body: 'Try the hint first. Reveal step 1 only if you still feel stuck.',
    },
    first_step_shown: {
      label: 'Step 1 shown',
      body: 'Work from that single step before you reveal anything else.',
    },
    next_step_shown: {
      label: 'Next step shown',
      body: 'Keep going one step at a time so you stay in control of the solution.',
    },
    solved: {
      label: 'Solved',
      body: 'You have enough to finish. When you are ready, try a similar question.',
    },
    similar_question_ready: {
      label: 'Similar practice ready',
      body: 'Use the new question to practice the same idea without seeing the whole solution.',
    },
  }

  const status = copy[state]

  return (
    <SurfaceCard className="py-3">
      <SectionHeading title="Tutor Status" />
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-[#F0EDE8]">{status.label}</div>
          <p className="mt-1 text-[13px] leading-[1.5] text-[#c6b4a4]">{status.body}</p>
        </div>
        <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-200">
          {state.replace(/_/g, ' ')}
        </span>
      </div>
    </SurfaceCard>
  )
}

function GuidedMessageCard({ message }: { message: GuidedTutorMessage }): React.JSX.Element {
  const toneClass =
    message.tone === 'canvas'
      ? 'border-amber-400/30 bg-amber-500/10'
      : message.tone === 'prompt'
        ? 'border-sky-400/25 bg-sky-500/10'
        : 'border-white/10 bg-white/[0.03]'

  return (
    <article className={`rounded-[8px] border p-3 ${toneClass}`}>
      <div className="text-[14px] font-semibold text-[#F0EDE8]">{message.title}</div>
      <RichTextBlock value={message.body} className="mt-1.5" />
    </article>
  )
}

function LessonTrackingCard({
  latestMessage,
  useWhiteboard,
}: {
  latestMessage: GuidedTutorMessage | null
  useWhiteboard: boolean
}): React.JSX.Element {
  return (
    <SurfaceCard className="py-3">
      <SectionHeading title={useWhiteboard ? 'Lesson Tracker' : 'Latest Tutor Update'} />
      {useWhiteboard ? (
        <div className="mt-1.5 space-y-1.5">
          <p className="text-[13px] leading-[1.5] text-[#c6b4a4]">
            The active lesson is now tracked on the whiteboard so your work and the tutor response stay in one place.
          </p>
          {latestMessage ? (
            <div className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[13px] font-semibold text-[#F0EDE8]">{latestMessage.title}</div>
              <p className="mt-1 text-[12px] leading-[1.4] text-[#c6b4a4]">Latest response is visible on the board overlay.</p>
            </div>
          ) : null}
        </div>
      ) : latestMessage ? (
        <GuidedMessageCard message={latestMessage} />
      ) : (
        <p className="mt-1.5 text-[13px] leading-[1.5] text-[#c6b4a4]">Check your work or ask for a hint to start the lesson.</p>
      )}
    </SurfaceCard>
  )
}

function LoadingSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="tutor-skeleton-card rounded-[8px] border border-white/10 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="tutor-skeleton-line mt-1 h-4 w-4 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="tutor-skeleton-line h-4 w-24 rounded" />
                <div className="tutor-skeleton-line h-4 w-full rounded" />
                <div className="tutor-skeleton-line h-4 w-2/3 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 text-[16px] font-semibold text-[#F0EDE8]">
        <span>Reading your homework</span>
        <span className="tutor-loading-dot">.</span>
        <span className="tutor-loading-dot" style={{ animationDelay: '0.15s' }}>.</span>
        <span className="tutor-loading-dot" style={{ animationDelay: '0.3s' }}>.</span>
      </div>
    </div>
  )
}

function SectionHeading({ title }: { title: string }): React.JSX.Element {
  return <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">{title}</h4>
}

function SurfaceCard({ children, className = '' }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  return <section className={`rounded-[8px] border border-white/10 bg-white/[0.03] p-3 ${className}`}>{children}</section>
}

function RichTextBlock({ value, className = '' }: { value: string; className?: string }): React.JSX.Element {
  return <div className={`text-[13px] leading-[1.5] text-[#F0EDE8] ${className}`} dangerouslySetInnerHTML={{ __html: formatTutorRichText(value) }} />
}

function ProblemSection({ value }: { value: string }): React.JSX.Element | null {
  if (!value.trim()) return null
  return (
    <SurfaceCard className="py-3">
      <SectionHeading title="Problem Summary" />
      <RichTextBlock value={value} className="mt-1.5" />
    </SurfaceCard>
  )
}

const AITutorTab: React.FC<AITutorTabProps> = ({
  className = '',
  hasPhoto,
  hasInput,
  inputMode = 'photo',
  problemDraft = '',
  onProblemDraftChange,
  analysis,
  isLoading,
  error,
  onStartAnalysis,
  onRetryAnalysis,
  responseAge,
  responseAgeInvalid,
  onResponseAgeChange,
  followUpDraft,
  isSubmitting,
  onFollowUpDraftChange,
  onSubmitFollowUp,
  onLessonMessageChange,
}) => {
  const resolvedHasInput = hasInput ?? hasPhoto
  const analyzeLabel = inputMode === 'text' ? 'Analyze Problem' : 'Analyze Photo'
  const emptyStateSubtext = inputMode === 'text'
    ? "Type or paste your homework problem and tap Analyze when you're ready."
    : "Add your homework photo and tap Analyze when you're ready."
  const missingInputMessage = inputMode === 'text'
    ? 'Type or paste a problem, then ask the tutor to analyze it.'
    : 'Import a photo, then ask the tutor to analyze it.'
  const analyzeIcon = inputMode === 'text' ? '🧠' : '📷'
  const errorIcon = inputMode === 'text' ? '🧠' : '📷'
  const errorTitle = inputMode === 'text' ? "Hmm, I couldn't parse that clearly" : "Hmm, I couldn't read that clearly"
  const errorBody = inputMode === 'text'
    ? 'Try separating the title, story details, and question into shorter lines, then analyze it again.'
    : 'Try retaking the photo with better lighting and make sure all your work is fully in frame.'
  const retryLabel = inputMode === 'text' ? 'Retry problem analysis' : 'Retry photo analysis'
  const [studentWorkDraft, setStudentWorkDraft] = useState('')
  const [flowState, setFlowState] = useState<GuidedTutorState>(resolvedHasInput ? 'idle' : 'awaiting_problem')
  const [revealedStepCount, setRevealedStepCount] = useState(0)
  const [guidedMessages, setGuidedMessages] = useState<GuidedTutorMessage[]>([])
  const [similarQuestion, setSimilarQuestion] = useState('')
  const guidedMessageIdRef = useRef(0)
  const hasStudentWork = studentWorkDraft.trim().length > 0
  const canShowStep = Boolean(analysis && analysis.steps.length > 0)
  const showProblemDraftEditor = inputMode === 'text' && !analysis
  const latestGuidedMessage = guidedMessages.at(-1) ?? null

  const appendGuidedMessage = (message: GuidedTutorMessage) => {
    const nextMessage = withUniqueMessageId(message)
    setGuidedMessages((current) => [...current, nextMessage])
    onLessonMessageChange?.(toLessonMessage(nextMessage))
  }

  const withUniqueMessageId = (message: GuidedTutorMessage): GuidedTutorMessage => {
    guidedMessageIdRef.current += 1
    return {
      ...message,
      id: `${message.id}-${guidedMessageIdRef.current}`,
    }
  }

  useEffect(() => {
    if (!resolvedHasInput) {
      guidedMessageIdRef.current = 0
      setFlowState('awaiting_problem')
      setGuidedMessages([])
      onLessonMessageChange?.(null)
      setRevealedStepCount(0)
      setSimilarQuestion('')
      return
    }

    if (!analysis) {
      guidedMessageIdRef.current = 0
      setFlowState('idle')
      setGuidedMessages([])
      onLessonMessageChange?.(null)
      setRevealedStepCount(0)
      setSimilarQuestion('')
      return
    }

    guidedMessageIdRef.current = 0
    const welcomeMessage = withUniqueMessageId(buildAnalysisOverviewMessage(analysis))
    setFlowState('awaiting_student_attempt')
    setGuidedMessages([welcomeMessage])
    onLessonMessageChange?.(toLessonMessage(welcomeMessage))
    setRevealedStepCount(0)
    setSimilarQuestion('')
  }, [analysis, onLessonMessageChange, resolvedHasInput])

  const handleCheckWork = () => {
    if (!analysis || !hasStudentWork) return
    setFlowState('evaluating_attempt')
    appendGuidedMessage(buildEvaluationMessage(studentWorkDraft.trim(), analysis))
  }

  const handleShowHint = () => {
    if (!analysis) return
    setFlowState('hint_shown')
    appendGuidedMessage(buildHintMessage(analysis))
  }

  const handleShowStep = (stepNumber: number) => {
    if (!analysis || stepNumber < 1) return
    const nextCount = Math.min(stepNumber, analysis.steps.length)
    setRevealedStepCount(nextCount)
    setFlowState(nextCount >= analysis.steps.length ? 'solved' : stepNumber === 1 ? 'first_step_shown' : 'next_step_shown')
    appendGuidedMessage(buildStepMessage(nextCount, analysis))
  }

  const handleSimilarQuestion = () => {
    const nextQuestion = buildSimilarQuestion(problemDraft || getProblemSummary(analysis))
    setSimilarQuestion(nextQuestion)
    setFlowState('similar_question_ready')
    appendGuidedMessage({
      id: 'similar-question',
      title: 'Similar question',
      body: `${nextQuestion}\n\nTry it on your own first, then come back for a hint if you need one.`,
      tone: 'assistant',
    })
  }

  return (
    <div className={`flex h-full min-h-0 flex-col bg-[#1c1c1e] text-[#F0EDE8] ${className}`}>
      <PanelScrollArea className="flex-1" contentClassName="h-full px-4 py-4">
        <div className="space-y-3 pb-4">
        {showProblemDraftEditor ? (
          <SurfaceCard>
            <SectionHeading title="Problem / Question" />
            <textarea
              aria-label="Problem or question"
              value={problemDraft}
              onChange={(event) => onProblemDraftChange?.(event.target.value)}
              rows={3}
              className="mt-1.5 w-full resize-none rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] text-[#F0EDE8] outline-none transition focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(201,130,43,0.16)] placeholder:text-[#c6b4a4]"
              placeholder="Type or paste the problem here so the tutor can guide you."
            />
          </SurfaceCard>
        ) : null}

        {!resolvedHasInput ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-[8px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-[14px] leading-[1.6] text-[#c6b4a4]">
            {missingInputMessage}
          </div>
        ) : null}

        {resolvedHasInput && !analysis && !isLoading && !error ? (
          <div className="flex min-h-full items-center justify-center py-10">
            <div className="max-w-[320px] text-center">
              <div className="text-[48px] leading-none" aria-hidden="true">📚</div>
              <h3 className="mt-4 text-[20px] font-semibold text-[#F0EDE8]">Ready to help you learn! 📚</h3>
              <p className="mt-3 text-[14px] leading-[1.6] text-[#c6b4a4]">{emptyStateSubtext}</p>
              <button
                type="button"
                onClick={onStartAnalysis}
                disabled={responseAgeInvalid}
                aria-label={analyzeLabel}
                className="tutor-analyze-idle mt-5 rounded-[8px] bg-amber-500 px-4 py-2 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">{analyzeIcon}</span>
                  <span>{analyzeLabel}</span>
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {resolvedHasInput && isLoading ? <LoadingSkeleton /> : null}

        {resolvedHasInput && !isLoading && error ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <div className="max-w-[320px] text-center">
              <div className="text-[32px] leading-none" aria-hidden="true">{errorIcon}</div>
              <div className="mt-4 text-[18px] font-semibold text-[#F0EDE8]">{errorTitle}</div>
              <p className="mt-2 text-[14px] leading-[1.6] text-[#c6b4a4]">{errorBody}</p>
            <button
              type="button"
              onClick={onRetryAnalysis}
              disabled={!resolvedHasInput || isLoading}
              aria-label={retryLabel}
              className="mt-4 rounded-[8px] bg-amber-500 px-4 py-2 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
            >
              Try Again
            </button>
            </div>
          </div>
        ) : null}

        {analysis ? (
          <>
            <ProblemSection value={getProblemSummary(analysis)} />
            <TutorStatus state={flowState} hasStudentWork={hasStudentWork} />

            <SurfaceCard className="pb-2.5">
              <SectionHeading title="Student Work" />
              <textarea
                aria-label="Student work"
                value={studentWorkDraft}
                onChange={(event) => setStudentWorkDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    handleCheckWork()
                  }
                }}
                rows={4}
                className="mt-1.5 w-full resize-none rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] text-[#F0EDE8] outline-none transition focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(201,130,43,0.16)] placeholder:text-[#c6b4a4]"
                placeholder="Paste your attempt here if you want feedback before a hint."
              />
              <p className="mt-1.5 text-[12px] leading-[1.4] text-[#c6b4a4]">
                Use Check my work for feedback on this box. Use Send only for follow-up chat.
              </p>
            </SurfaceCard>

            <div className="sticky bottom-0 z-10 -mx-4 border-y border-white/10 bg-[#1c1c1e]/95 px-4 py-3 backdrop-blur">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Primary Actions</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCheckWork}
                  disabled={!hasStudentWork}
                  aria-label="Check my work"
                  className="rounded-full bg-amber-500 px-4 py-2 text-[13px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                >
                  Check my work
                </button>
                <button
                  type="button"
                  onClick={handleShowHint}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] font-semibold text-[#F0EDE8] transition hover:border-amber-400/50 hover:bg-white/[0.06]"
                >
                  Give me a hint
                </button>
                <button
                  type="button"
                  onClick={() => handleShowStep(1)}
                  disabled={!canShowStep}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] font-semibold text-[#F0EDE8] transition hover:border-amber-400/50 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  Show step 1
                </button>
                <button
                  type="button"
                  onClick={() => handleShowStep(revealedStepCount + 1)}
                  disabled={!analysis || revealedStepCount === 0 || revealedStepCount >= analysis.steps.length}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] font-semibold text-[#F0EDE8] transition hover:border-amber-400/50 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  Show next step
                </button>
                <button
                  type="button"
                  onClick={handleSimilarQuestion}
                  disabled={flowState !== 'solved' && flowState !== 'similar_question_ready'}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] font-semibold text-[#F0EDE8] transition hover:border-amber-400/50 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  Similar question
                </button>
              </div>
            </div>

            <LessonTrackingCard latestMessage={latestGuidedMessage} useWhiteboard={inputMode === 'photo'} />

            {similarQuestion ? (
              <SurfaceCard>
                <SectionHeading title="Practice Next" />
                <RichTextBlock value={similarQuestion} className="mt-1.5" />
              </SurfaceCard>
            ) : null}
          </>
        ) : null}
        </div>
      </PanelScrollArea>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/10 bg-[#1c1c1e] p-4">
        <div className="mb-3">
          <label htmlFor="ai-tutor-response-age" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">
            Response age (optional)
          </label>
          <input
            id="ai-tutor-response-age"
            type="number"
            min={5}
            max={20}
            inputMode="numeric"
            value={responseAge}
            onChange={(event) => onResponseAgeChange(event.target.value)}
            className="w-full rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] text-[#F0EDE8] outline-none transition focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(201,130,43,0.16)]"
            placeholder="Enter 5-20 to match the explanation level"
            aria-invalid={responseAgeInvalid}
            aria-describedby="ai-tutor-response-age-help"
          />
          <p id="ai-tutor-response-age-help" className={`mt-1.5 text-[12px] leading-[1.4] ${responseAgeInvalid ? 'text-red-300' : 'text-[#c6b4a4]'}`}>
            {responseAgeInvalid
              ? 'Enter a whole-number age from 5 to 20.'
              : 'Adjusts the explanation level without changing the student-work actions above.'}
          </p>
        </div>

        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">
          Ask a follow-up
        </label>
        <div className="tutor-followup-shell relative w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-3 py-2 transition focus-within:border-amber-400 focus-within:shadow-[0_0_0_3px_rgba(201,130,43,0.16)]">
          <input
            aria-label="Ask the AI tutor a follow-up question"
            type="text"
            value={followUpDraft}
            onChange={(event) => onFollowUpDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmitFollowUp()
              }
            }}
            disabled={!resolvedHasInput || isLoading || isSubmitting || !analysis}
            className="min-w-0 w-full border-none bg-transparent px-1 py-2 pr-[72px] text-[14px] text-[#F0EDE8] outline-none transition placeholder:text-[14px] placeholder:text-[#c6b4a4]"
            placeholder={!resolvedHasInput ? (inputMode === 'text' ? 'Type a problem first' : 'Import a photo first') : 'Ask a follow-up question...'}
          />
          <button
            type="button"
            onClick={onSubmitFollowUp}
            disabled={!resolvedHasInput || isLoading || isSubmitting || !analysis || !followUpDraft.trim() || responseAgeInvalid}
            aria-label={isSubmitting ? 'Sending follow-up question' : 'Send follow-up question'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[16px] bg-amber-500 px-3 py-1.5 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            <span className="flex items-center gap-1">
              {isSubmitting ? <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-950/25 border-t-slate-950 animate-spin" aria-hidden="true" /> : <SendHorizonal className="h-3.5 w-3.5" />}
              {isSubmitting ? 'Sending…' : 'Send'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AITutorTab
