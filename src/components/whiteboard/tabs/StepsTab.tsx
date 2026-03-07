import React from 'react'
import { CheckCircle2, CircleX } from 'lucide-react'
import type { WhiteboardTutorStep } from '../../../types/whiteboard'
import { formatTutorRichText } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export interface StepsTabProps {
  className?: string
  hasPhoto: boolean
  isLoading: boolean
  correctSolution?: string
  steps: WhiteboardTutorStep[]
}

const StepsTab: React.FC<StepsTabProps> = ({ className = '', hasPhoto, isLoading, correctSolution = '', steps }) => {
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

      {hasPhoto && !isLoading && steps.length === 0 ? (
        <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4 text-[14px] leading-[1.6] text-[#c6b4a4]">
          Steps will appear here after the AI tutor analyzes the photo.
        </div>
      ) : null}

      {steps.length > 0 ? <h3 className="text-[18px] font-semibold text-[#F0EDE8]">Step-by-Step Walkthrough</h3> : null}

      <div className="space-y-4">
        {steps.map((step) => (
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
          <h4 className="text-[15px] font-semibold text-[#F0EDE8]">Correct Full Solution</h4>
          <div className="mt-2 text-[14px] leading-[1.6] text-[#F0EDE8]" dangerouslySetInnerHTML={{ __html: formatTutorRichText(correctSolution) }} />
        </section>
      ) : null}
      </div>
    </PanelScrollArea>
  )
}

export default StepsTab
