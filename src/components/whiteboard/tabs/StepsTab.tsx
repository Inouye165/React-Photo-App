import React from 'react'
import { CheckCircle2, CircleX, Eye, EyeOff, Pause, Play, RotateCcw, SkipBack, SkipForward, TriangleAlert } from 'lucide-react'
import type { TutorAnalysisResult, TutorStepAnalysis, WhiteboardTutorStep } from '../../../types/whiteboard'
import { formatTutorRichText } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export interface StepsTabProps {
  className?: string
  hasPhoto: boolean
  isLoading: boolean
  correctSolution?: string
  analysisResult?: TutorAnalysisResult | null
  steps: WhiteboardTutorStep[]
  activeStepId?: string | null
  overlayVisible?: boolean
  canPlay?: boolean
  isPlaying?: boolean
  onToggleOverlay?: () => void
  onPlay?: () => void
  onPause?: () => void
  onPrevious?: () => void
  onNext?: () => void
  onReplay?: () => void
  onStepSelect?: (stepId: string) => void
}

function getStatusMeta(step: TutorStepAnalysis | WhiteboardTutorStep) {
  if ('status' in step) {
    if (step.status === 'correct') return { label: 'Correct', icon: CheckCircle2, tone: 'correct' as const }
    if (step.status === 'incorrect') return { label: 'Incorrect', icon: CircleX, tone: 'incorrect' as const }
    if (step.status === 'partial') return { label: 'Partial', icon: TriangleAlert, tone: 'partial' as const }
    return { label: 'Warning', icon: TriangleAlert, tone: 'warning' as const }
  }

  if (step.neutral) return { label: 'Partial', icon: TriangleAlert, tone: 'partial' as const }
  if (step.correct) return { label: 'Correct', icon: CheckCircle2, tone: 'correct' as const }
  return { label: 'Incorrect', icon: CircleX, tone: 'incorrect' as const }
}

const StepsTab: React.FC<StepsTabProps> = ({
  className = '',
  hasPhoto,
  isLoading,
  correctSolution = '',
  analysisResult = null,
  steps,
  activeStepId = null,
  overlayVisible = true,
  canPlay = false,
  isPlaying = false,
  onToggleOverlay,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onReplay,
  onStepSelect,
}) => {
  const structuredSteps = analysisResult?.steps ?? []

  return (
    <PanelScrollArea className={`h-full bg-[#1c1c1e] text-[#F0EDE8] ${className}`} contentClassName="h-full px-4 py-4">
      <div className="space-y-3 pb-6">
        {!hasPhoto ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-[8px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-[14px] leading-[1.6] text-[#c6b4a4]">
            Import a photo to generate step-by-step feedback.
          </div>
        ) : null}

        {hasPhoto && isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="tutor-skeleton-card rounded-[8px] border border-white/10 p-4">
                <div className="tutor-skeleton-line h-4 w-1/4 rounded" />
                <div className="tutor-skeleton-line mt-3 h-4 w-full rounded" />
                <div className="tutor-skeleton-line mt-2 h-4 w-2/3 rounded" />
              </div>
            ))}
          </div>
        ) : null}

        {hasPhoto && !isLoading && steps.length === 0 && structuredSteps.length === 0 ? (
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4 text-[14px] leading-[1.6] text-[#c6b4a4]">
            Steps will appear here after the AI tutor analyzes the photo.
          </div>
        ) : null}

        {structuredSteps.length > 0 ? (
          <section className="rounded-[12px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-semibold text-[#F0EDE8]">Validator-Backed Walkthrough</h3>
                <p className="mt-1 text-[13px] leading-[1.6] text-[#c6b4a4]">Click a step to focus it on the whiteboard, or use playback to guide attention one step at a time.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onToggleOverlay}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-[#F0EDE8]"
                >
                  {overlayVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {overlayVisible ? 'Hide tutor overlay' : 'Show tutor overlay'}
                </button>
                <button type="button" onClick={onPrevious} className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-[#F0EDE8]" aria-label="Previous step">
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={isPlaying ? onPause : onPlay}
                  disabled={!canPlay}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-3 py-2 text-[12px] font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button type="button" onClick={onNext} className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-[#F0EDE8]" aria-label="Next step">
                  <SkipForward className="h-4 w-4" />
                </button>
                <button type="button" onClick={onReplay} className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-[#F0EDE8]" aria-label="Replay steps">
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {analysisResult?.finalAnswers.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {analysisResult.finalAnswers.map((answer) => (
                  <span key={answer} className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-200">
                    Final answer: {answer}
                  </span>
                ))}
              </div>
            ) : null}

            {analysisResult?.validatorWarnings.length ? (
              <div className="mt-4 space-y-2 rounded-[10px] border border-amber-400/25 bg-amber-500/10 p-3">
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-amber-200">Validator notes</div>
                {analysisResult.validatorWarnings.map((warning) => (
                  <p key={warning} className="text-[13px] leading-[1.6] text-amber-100">{warning}</p>
                ))}
              </div>
            ) : null}
          </section>
        ) : steps.length > 0 ? <h3 className="text-[18px] font-semibold text-[#F0EDE8]">Step-by-Step Walkthrough</h3> : null}

        <div className="space-y-4">
          {structuredSteps.length > 0
            ? structuredSteps.map((step, index) => {
                const statusMeta = getStatusMeta(step)
                const StatusIcon = statusMeta.icon
                const isActive = activeStepId === step.id
                const toneClass =
                  statusMeta.tone === 'correct'
                    ? 'border-l-[#4CAF50] bg-[rgba(76,175,80,0.08)]'
                    : statusMeta.tone === 'incorrect'
                      ? 'border-l-[#EF5350] bg-[rgba(239,83,80,0.08)]'
                      : statusMeta.tone === 'partial'
                        ? 'border-l-[#F59E0B] bg-[rgba(245,158,11,0.08)]'
                        : 'border-l-[#7DD3FC] bg-[rgba(125,211,252,0.08)]'

                return (
                  <button
                    type="button"
                    role="article"
                    aria-label={`Step ${index + 1}: ${statusMeta.label}`}
                    key={step.id}
                    onClick={() => onStepSelect?.(step.id)}
                    className={`block w-full rounded-[10px] border border-white/10 border-l-[4px] p-4 text-left transition ${toneClass} ${isActive ? 'ring-2 ring-amber-400/60' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[rgba(17,17,17,0.65)] text-[13px] font-semibold text-[#F0EDE8]">{index + 1}</div>
                        {index !== structuredSteps.length - 1 ? <div className="mt-2 h-8 w-px bg-white/10" aria-hidden="true" /> : null}
                      </div>
                      <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[15px] font-semibold text-[#F0EDE8]">{step.shortLabel}</div>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">{statusMeta.label}</span>
                        </div>
                        <div className="mt-2 text-[14px] leading-[1.6] text-[#F0EDE8]" dangerouslySetInnerHTML={{ __html: formatTutorRichText(step.studentText || step.normalizedMath || '') }} />
                        <div className="mt-2 text-[14px] leading-[1.6] text-amber-200" dangerouslySetInnerHTML={{ __html: formatTutorRichText(step.kidFriendlyExplanation) }} />
                        {step.correction ? <div className="mt-2 text-[13px] leading-[1.6] text-rose-200">What to do instead: {step.correction}</div> : null}
                        {step.hint ? <div className="mt-1 text-[13px] leading-[1.6] text-sky-200">Hint: {step.hint}</div> : null}
                      </div>
                    </div>
                  </button>
                )
              })
            : steps.map((step) => (
                <article
                  role="article"
                  aria-label={`Step ${step.number}: ${step.neutral ? 'neutral' : step.correct ? 'correct' : 'incorrect'}`}
                  key={step.number}
                  className={`tutor-step-card rounded-[8px] p-4 transition-colors ${
                    step.neutral
                      ? 'border-l-[4px] border-l-white/15 bg-white/[0.03]'
                      : step.correct
                        ? 'tutor-step-card--correct border-l-[4px] border-l-[#4CAF50] bg-[rgba(76,175,80,0.08)]'
                        : 'tutor-step-card--incorrect border-l-[4px] border-l-[#EF5350] bg-[rgba(239,83,80,0.08)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${
                        step.neutral
                          ? 'border border-white/15 bg-white/[0.04] text-[#c6b4a4]'
                          : step.correct
                            ? 'bg-[rgba(76,175,80,0.18)] text-[#4CAF50]'
                            : 'bg-[rgba(239,83,80,0.18)] text-[#EF5350]'
                      }`}>{step.number}</div>
                      {step.number !== steps.length ? <div className="mt-2 h-8 w-px bg-white/10" aria-hidden="true" /> : null}
                    </div>
                    {step.correct && !step.neutral ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF50]" aria-label="Correct step" />
                    ) : null}
                    {!step.correct && !step.neutral ? (
                      <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-[#EF5350]" aria-label="Incorrect step" />
                    ) : null}
                    <div className="min-w-0 flex-1 overflow-visible">
                      <div className="text-[15px] font-semibold text-[#F0EDE8]">{step.label || `Step ${step.number}`}</div>
                      <div className="mt-1 text-[14px] leading-[1.6] text-[#F0EDE8]" dangerouslySetInnerHTML={{ __html: formatTutorRichText(step.studentWork) }} />
                      <div className="mt-2 text-[14px] leading-[1.6] text-amber-300" dangerouslySetInnerHTML={{ __html: formatTutorRichText(step.explanation) }} />
                    </div>
                  </div>
                </article>
              ))}
        </div>

        {correctSolution ? (
          <section className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4">
            <h4 className="text-[15px] font-semibold text-[#F0EDE8]">Validated Final Answer</h4>
            <div className="mt-2 text-[14px] leading-[1.6] text-[#F0EDE8]" dangerouslySetInnerHTML={{ __html: formatTutorRichText(correctSolution) }} />
          </section>
        ) : null}
      </div>
    </PanelScrollArea>
  )
}

export default StepsTab
