import React from 'react'
import { CheckCircle2, CircleX, SendHorizonal } from 'lucide-react'
import type { WhiteboardTutorResponse } from '../../../types/whiteboard'
import { formatTutorRichText, parseTutorListItems } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export interface AITutorTabProps {
  className?: string
  hasPhoto: boolean
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
      <div className="flex items-center gap-1 text-[16px] font-semibold text-[#F0EDE8]">
        <span>Reading your homework</span>
        <span className="tutor-loading-dot">.</span>
        <span className="tutor-loading-dot" style={{ animationDelay: '0.15s' }}>.</span>
        <span className="tutor-loading-dot" style={{ animationDelay: '0.3s' }}>.</span>
      </div>
      <p className="text-[14px] leading-[1.6] text-[#c6b4a4]">Looking for what you already did well, where the work turns, and the clearest next fix.</p>
      <div className="h-6 w-2/5 animate-pulse rounded bg-white/10" />
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-full animate-pulse rounded bg-white/10" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-white/10" />
      </div>
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-full animate-pulse rounded bg-white/10" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
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
}: {
  label: string
  body: string
  tone: 'correct' | 'incorrect' | 'neutral'
  detail?: string | null
}): React.JSX.Element {
  const toneClass =
    tone === 'correct'
      ? 'border-l-[4px] border-l-[#4CAF50] bg-[rgba(76,175,80,0.08)] hover:bg-[rgba(76,175,80,0.12)]'
      : tone === 'incorrect'
        ? 'border-l-[4px] border-l-[#EF5350] bg-[rgba(239,83,80,0.08)] hover:bg-[rgba(239,83,80,0.12)]'
        : 'border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'

  return (
    <article className={`rounded-[8px] p-3 transition-colors ${toneClass}`}>
      <div className="flex items-start gap-3">
        {tone === 'correct' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF50]" /> : null}
        {tone === 'incorrect' ? <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-[#EF5350]" /> : null}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-[#F0EDE8]">{label}</div>
          <RichTextBlock value={body} className="mt-1" />
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
                label={`Step ${step.number}`}
                body={step.description}
                detail={step.errorExplanation}
                tone={step.isCorrect ? 'correct' : 'incorrect'}
              />
            ))
          : [<RichTextBlock key="fallback" value={analysis.sections.stepsAnalysis} />]}
      </div>
    </SurfaceCard>
  )
}

function ScoreLine({ analysis }: { analysis: WhiteboardTutorResponse }): React.JSX.Element | null {
  const totalSteps = analysis.steps.length
  if (totalSteps === 0) return null

  const correctSteps = analysis.steps.filter((step) => step.isCorrect).length
  const toneClass = correctSteps === totalSteps ? 'text-[#4CAF50]' : 'text-amber-300'

  return <div className={`text-[15px] font-semibold ${toneClass}`}>You got {correctSteps} out of {totalSteps} steps correct!</div>
}

function ErrorsSection({ analysis }: { analysis: WhiteboardTutorResponse }): React.JSX.Element | null {
  const items = parseTutorListItems(analysis.sections.errorsFound)
  if (!analysis.sections.errorsFound.trim()) return null

  return (
    <SurfaceCard>
      <SectionHeading title="Errors Found" />
      {/* Fix 3: the Errors Found content could end up hidden near the bottom, so it now renders as visible cards inside the panel scroll area. */}
      <div className="mt-3 space-y-2">
        {items.length > 0
          ? items.map((item, index) => <StepCard key={`${item}-${index}`} label={`Issue ${index + 1}`} body={item} tone="incorrect" />)
          : [<RichTextBlock key="errors-fallback" value={analysis.sections.errorsFound} />]}
      </div>
    </SurfaceCard>
  )
}

function EncouragementSection({ value }: { value: string }): React.JSX.Element | null {
  if (!value.trim()) return null
  return (
    <SurfaceCard className="bg-[rgba(201,130,43,0.08)]">
      <SectionHeading title="Encouragement" />
      <RichTextBlock value={value} className="mt-2" />
    </SurfaceCard>
  )
}

const AITutorTab: React.FC<AITutorTabProps> = ({
  className = '',
  hasPhoto,
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
  return (
    <div className={`flex h-full min-h-0 flex-col bg-[#1c1c1e] text-[#F0EDE8] ${className}`}>
      <PanelScrollArea className="flex-1" contentClassName="h-full px-4 py-4">
        <div className="space-y-4 pb-6">
        {!hasPhoto ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-[8px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-[14px] leading-[1.6] text-[#c6b4a4]">
            Import a photo, then ask the tutor to analyze it.
          </div>
        ) : null}

        {hasPhoto && !analysis && !isLoading && !error ? (
          <SurfaceCard>
            <div className="text-[15px] font-semibold text-[#F0EDE8]">AI tutor is idle</div>
            <p className="mt-2 text-[14px] leading-[1.6] text-[#c6b4a4]">
              No model call is made when a photo is added. Start analysis only when the student asks for help.
            </p>
            <button
              type="button"
              onClick={onStartAnalysis}
              disabled={responseAgeInvalid}
              className="mt-4 rounded-[8px] bg-amber-500 px-4 py-2 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
            >
              Analyze photo
            </button>
          </SurfaceCard>
        ) : null}

        {hasPhoto && isLoading ? <LoadingSkeleton /> : null}

        {hasPhoto && !isLoading && error ? (
          <SurfaceCard className="border-red-500/30 bg-red-500/10">
            <div className="text-[15px] font-semibold text-red-100">The tutor hit a snag.</div>
            <p className="mt-2 text-[14px] leading-[1.6] text-red-100/90">
              Please try again. If the photo is blurry or cut off, retake it so the writing is easier to read.
            </p>
            <p className="mt-2 text-[13px] leading-[1.5] text-red-100/75">{error}</p>
            <button
              type="button"
              onClick={onRetryAnalysis}
              disabled={!hasPhoto || isLoading}
              className="mt-4 rounded-[8px] bg-red-400 px-4 py-2 text-[14px] font-semibold text-slate-950 transition hover:bg-red-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
            >
              Try again
            </button>
          </SurfaceCard>
        ) : null}

        {analysis ? (
          <>
            <ProblemSection value={analysis.sections.problem} />
            <StepsSection analysis={analysis} />
            <ScoreLine analysis={analysis} />
            <ErrorsSection analysis={analysis} />
            <EncouragementSection value={analysis.sections.encouragement} />
          </>
        ) : null}
        </div>
      </PanelScrollArea>

      <div className="border-t border-white/10 p-4">
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
        <div className="relative w-full">
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
            disabled={!hasPhoto || isLoading || isSubmitting || !analysis}
            className="min-w-0 w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3 pr-22 text-[14px] text-[#F0EDE8] outline-none transition placeholder:text-[14px] placeholder:text-[#c6b4a4] focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(201,130,43,0.16)]"
            placeholder={!hasPhoto ? 'Import a photo first' : 'Ask a follow-up question...'}
          />
          <button
            type="button"
            onClick={onSubmitFollowUp}
            disabled={!hasPhoto || isLoading || isSubmitting || !analysis || !followUpDraft.trim() || responseAgeInvalid}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[18px] bg-amber-500 px-3 py-1.5 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            <span className="flex items-center gap-1">
              <SendHorizonal className="h-3.5 w-3.5" />
              {isSubmitting ? 'Sending…' : 'Send'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AITutorTab
