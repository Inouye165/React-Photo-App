import React from 'react'
import { CheckCircle2, CircleX } from 'lucide-react'
import type { WhiteboardTutorStep } from '../../../types/whiteboard'

export interface StepsTabProps {
  className?: string
  hasPhoto: boolean
  isLoading: boolean
  steps: WhiteboardTutorStep[]
}

const StepsTab: React.FC<StepsTabProps> = ({ className = '', hasPhoto, isLoading, steps }) => {
  return (
    <div className={`h-full overflow-y-auto bg-[#161b22] p-4 text-white ${className}`}>
      {!hasPhoto ? (
        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
          Import a photo to generate step-by-step feedback.
        </div>
      ) : null}

      {hasPhoto && isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="h-4 w-1/4 animate-pulse rounded bg-white/10" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-white/10" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : null}

      {hasPhoto && !isLoading && steps.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          Steps will appear here after the AI tutor analyzes the photo.
        </div>
      ) : null}

      <div className="space-y-3">
        {steps.map((step) => (
          <article key={step.number} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start gap-3">
              {step.isCorrect ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Step {step.number}</div>
                <p className="mt-1 text-sm leading-6 text-slate-100">{step.description}</p>
                {!step.isCorrect && step.errorExplanation ? (
                  <p className="mt-2 text-sm leading-6 text-amber-300">{step.errorExplanation}</p>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export default StepsTab
