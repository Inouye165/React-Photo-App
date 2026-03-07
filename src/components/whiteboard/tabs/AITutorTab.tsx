import React from 'react'
import type { WhiteboardTutorResponse } from '../../../types/whiteboard'

export interface AITutorTabProps {
  className?: string
  hasPhoto: boolean
  analysis: WhiteboardTutorResponse | null
  isLoading: boolean
  error: string | null
  onStartAnalysis: () => void
  followUpDraft: string
  isSubmitting: boolean
  onFollowUpDraftChange: (value: string) => void
  onSubmitFollowUp: () => void
}

function LoadingSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
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

function Section({ title, value }: { title: string; value: string }): React.JSX.Element | null {
  if (!value.trim()) return null
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">{title}</h4>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">{value}</p>
    </section>
  )
}

const AITutorTab: React.FC<AITutorTabProps> = ({
  className = '',
  hasPhoto,
  analysis,
  isLoading,
  error,
  onStartAnalysis,
  followUpDraft,
  isSubmitting,
  onFollowUpDraftChange,
  onSubmitFollowUp,
}) => {
  return (
    <div className={`flex h-full flex-col bg-[#161b22] text-white ${className}`}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!hasPhoto ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
            Import a photo, then ask the tutor to analyze it.
          </div>
        ) : null}

        {hasPhoto && !analysis && !isLoading && !error ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h4 className="text-sm font-semibold text-white">AI tutor is idle</h4>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              No model call is made when a photo is added. Start analysis only when the student asks for help.
            </p>
            <button
              type="button"
              onClick={onStartAnalysis}
              className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              Analyze photo
            </button>
          </div>
        ) : null}

        {hasPhoto && isLoading ? <LoadingSkeleton /> : null}

        {hasPhoto && !isLoading && error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {analysis ? (
          <>
            <Section title="Problem" value={analysis.sections.problem} />
            <Section title="Steps Analysis" value={analysis.sections.stepsAnalysis} />
            <Section title="Errors Found" value={analysis.sections.errorsFound} />
            <Section title="Encouragement" value={analysis.sections.encouragement} />
          </>
        ) : null}
      </div>

      <div className="border-t border-white/10 p-4">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Ask a follow-up
        </label>
        <div className="flex gap-2">
          <input
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
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400"
            placeholder={
              !hasPhoto
                ? 'Import a photo first'
                : analysis
                  ? 'Ask about a step, error, or another approach'
                  : 'Start analysis first'
            }
          />
          <button
            type="button"
            onClick={onSubmitFollowUp}
            disabled={!hasPhoto || isLoading || isSubmitting || !analysis || !followUpDraft.trim()}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            {isSubmitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AITutorTab
