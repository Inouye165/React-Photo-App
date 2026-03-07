import React from 'react'
import { CheckCircle2, CircleX } from 'lucide-react'
import type { WhiteboardTutorStep } from '../../../types/whiteboard'
import { formatTutorRichText } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export interface StepsTabProps {
  className?: string
  hasPhoto: boolean
  isLoading: boolean
  steps: WhiteboardTutorStep[]
}

const StepsTab: React.FC<StepsTabProps> = ({ className = '', hasPhoto, isLoading, steps }) => {
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
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4">
              <div className="h-4 w-1/4 animate-pulse rounded bg-white/10" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-white/10" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : null}

      {hasPhoto && !isLoading && steps.length === 0 ? (
        <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4 text-[14px] leading-[1.6] text-[#c6b4a4]">
          Steps will appear here after the AI tutor analyzes the photo.
        </div>
      ) : null}

      <div className="space-y-3">
        {steps.map((step) => (
          <article
            key={step.number}
            className={`rounded-[8px] p-4 transition-colors ${
              step.isCorrect
                ? 'border-l-[4px] border-l-[#4CAF50] bg-[rgba(76,175,80,0.08)] hover:bg-[rgba(76,175,80,0.12)]'
                : 'border-l-[4px] border-l-[#EF5350] bg-[rgba(239,83,80,0.08)] hover:bg-[rgba(239,83,80,0.12)]'
            }`}
          >
            <div className="flex items-start gap-3">
              {step.isCorrect ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF50]" />
              ) : (
                <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-[#EF5350]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-[#F0EDE8]">Step {step.number}</div>
                <div className="mt-1 text-[14px] leading-[1.6] text-[#F0EDE8]" dangerouslySetInnerHTML={{ __html: formatTutorRichText(step.description) }} />
                {!step.isCorrect && step.errorExplanation ? (
                  <div className="mt-2 text-[14px] leading-[1.6] text-amber-300" dangerouslySetInnerHTML={{ __html: formatTutorRichText(step.errorExplanation) }} />
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      </div>
    </PanelScrollArea>
  )
}

export default StepsTab
