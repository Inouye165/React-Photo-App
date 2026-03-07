import React, { useEffect, useState } from 'react'
import { CheckCircle2, CircleX, SendHorizonal } from 'lucide-react'
import type { WhiteboardTutorResponse } from '../../../types/whiteboard'
import { formatTutorRichText } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export interface AITutorTabProps {
  className?: string
  hasPhoto: boolean
  hasInput?: boolean
  inputMode?: 'photo' | 'text'
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
  return <section className={`rounded-[8px] border border-white/10 bg-white/[0.03] p-4 ${className}`}>{children}</section>
}

function RichTextBlock({ value, className = '' }: { value: string; className?: string }): React.JSX.Element {
  return <div className={`text-[14px] leading-[1.6] text-[#F0EDE8] ${className}`} dangerouslySetInnerHTML={{ __html: formatTutorRichText(value) }} />
}

function ProblemSection({ value }: { value: string }): React.JSX.Element | null {
  if (!value.trim()) return null
  return (
    <SurfaceCard>
      <SectionHeading title="Problem" />
      <RichTextBlock value={value} className="mt-2" />
    </SurfaceCard>
  )
}

function StepCard({
  label,
  body,
  tone,
  detail,
  stepNumber,
}: {
  label: string
  body: string
  tone: 'correct' | 'incorrect' | 'neutral'
  detail?: string | null
  stepNumber: number
}): React.JSX.Element {
  const toneClass =
    tone === 'correct'
      ? 'tutor-step-card tutor-step-card--correct border-l-[4px] border-l-[#4CAF50] bg-[rgba(76,175,80,0.08)]'
      : tone === 'incorrect'
        ? 'tutor-step-card tutor-step-card--incorrect border-l-[4px] border-l-[#EF5350] bg-[rgba(239,83,80,0.08)]'
        : 'tutor-step-card border-l-[4px] border-l-white/15 bg-white/[0.03]'

  const statusLabel = tone === 'neutral' ? 'neutral' : tone

  return (
    <article
      role="article"
      aria-label={`Step ${stepNumber}: ${statusLabel}`}
      className={`rounded-[8px] p-3 transition-colors ${toneClass}`}
    >
      <div className="flex items-start gap-3">
        {tone === 'correct' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF50]" aria-label="Correct step" /> : null}
        {tone === 'incorrect' ? <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-[#EF5350]" aria-label="Incorrect step" /> : null}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-[#F0EDE8]">{label}</div>
          <RichTextBlock value={body} className="mt-1 overflow-visible" />
          {detail ? <RichTextBlock value={detail} className="mt-2 text-[#e7b274]" /> : null}
        </div>
      </div>
    </article>
  )
}

function StepsSection({ analysis }: { analysis: WhiteboardTutorResponse }): React.JSX.Element | null {
  if (!analysis.sections.stepsAnalysis.trim() && analysis.steps.length === 0) return null

  return (
    <SurfaceCard>
      <SectionHeading title="Steps Analysis" />
      <div className="mt-3 space-y-2">
        {analysis.steps.length > 0
          ? analysis.steps.map((step) => (
              <StepCard
                key={step.number}
                stepNumber={step.number}
                label={step.label || `Step ${step.number}`}
                body={step.studentWork}
                detail={step.explanation}
                tone={step.neutral ? 'neutral' : step.correct ? 'correct' : 'incorrect'}
              />
            ))
          : [<RichTextBlock key="fallback" value={analysis.sections.stepsAnalysis} />]}
      </div>
    </SurfaceCard>
  )
}

function ScoreLine({ analysis }: { analysis: WhiteboardTutorResponse }): React.JSX.Element | null {
  const [displayCount, setDisplayCount] = useState(0)
  const totalSteps = analysis.scoreTotal
  if (totalSteps === 0) return null

  const correctSteps = analysis.scoreCorrect
  const toneClass = correctSteps / totalSteps > 0.6 ? 'text-[#4CAF50]' : 'text-amber-300'

  useEffect(() => {
    const target = correctSteps
    let frameId = 0
    let startTime: number | null = null

    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / 800, 1)
      setDisplayCount(Math.round(target * progress))
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    setDisplayCount(0)
    frameId = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(frameId)
  }, [correctSteps])

  return (
    <div>
      <div className={`text-[15px] font-semibold ${toneClass}`}>You got {displayCount} out of {totalSteps} steps right! 🎉</div>
      {analysis.closingEncouragement ? (
        <p className="mt-2 text-[14px] italic leading-[1.6] text-amber-300" dangerouslySetInnerHTML={{ __html: formatTutorRichText(analysis.closingEncouragement) }} />
      ) : null}
    </div>
  )
}

function ErrorsSection({ analysis }: { analysis: WhiteboardTutorResponse }): React.JSX.Element | null {
  if (analysis.errorsFound.length === 0) return null

  return (
    <SurfaceCard>
      <SectionHeading title="Let's Fix These Together 🔧" />
      <div className="mt-3 space-y-2">
        {analysis.errorsFound.map((item) => (
          <StepCard
            key={`${item.stepNumber}-${item.issue}`}
            stepNumber={item.stepNumber}
            label={`Step ${item.stepNumber}`}
            body={item.issue}
            detail={item.correction}
            tone="incorrect"
          />
        ))}
      </div>
    </SurfaceCard>
  )
}

const AITutorTab: React.FC<AITutorTabProps> = ({
  className = '',
  hasPhoto,
  hasInput,
  inputMode = 'photo',
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

  return (
    <div className={`flex h-full min-h-0 flex-col bg-[#1c1c1e] text-[#F0EDE8] ${className}`}>
      <PanelScrollArea className="flex-1" contentClassName="h-full px-4 py-4">
        <div className="space-y-4 pb-6">
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
            <ProblemSection value={analysis.sections.problem} />
            <StepsSection analysis={analysis} />
            <ScoreLine analysis={analysis} />
            <ErrorsSection analysis={analysis} />
          </>
        ) : null}
        </div>
      </PanelScrollArea>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/10 bg-[#1c1c1e] p-4">
        <div className="mb-4">
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
          <p id="ai-tutor-response-age-help" className={`mt-2 text-[14px] leading-[1.6] ${responseAgeInvalid ? 'text-red-300' : 'text-[#c6b4a4]'}`}>
            {responseAgeInvalid
              ? 'Enter a whole-number age from 5 to 20.'
              : 'This sets the tutor tone for the response. The tutor will not ask the learner for their age.'}
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
