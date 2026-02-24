import React from 'react'
import type { ChessTutorAnalysis } from '../../../api/chessTutor'

const classes = {
  panel: 'rounded-2xl border border-slate-700 bg-slate-900/60 p-4',
  cta: 'mb-3 inline-flex min-h-10 items-center rounded-lg border border-indigo-300/50 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-50 transition hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50',
  sectionTitle: 'text-xs font-semibold uppercase tracking-wide text-slate-400',
  body: 'mt-1 text-sm text-slate-200',
} as const

export default function AnalyzePanel({
  loading,
  error,
  analysis,
  onAnalyze,
}: {
  loading: boolean
  error: string | null
  analysis: ChessTutorAnalysis | null
  onAnalyze: () => void
}): React.JSX.Element {
  return (
    <div className={classes.panel}>
      <button
        type="button"
        onClick={onAnalyze}
        disabled={loading}
        className={classes.cta}
      >
        {loading ? 'Analyzing…' : 'Analyze game for me'}
      </button>
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      {!error && !analysis && !loading ? <div className="text-sm text-slate-300">Press “Analyze game for me” to get a position summary, hints, and focus points.</div> : null}
      {analysis ? (
        <div className="space-y-3 text-slate-100">
          <div>
            <div className={classes.sectionTitle}>Position Summary</div>
            <p className={classes.body}>{analysis.positionSummary}</p>
          </div>
          <div>
            <div className={classes.sectionTitle}>Hints</div>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-200">
              {(analysis.hints.length ? analysis.hints : ['No immediate tactical hints detected.']).map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className={classes.sectionTitle}>Focus Points</div>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-200">
              {(analysis.focusAreas.length ? analysis.focusAreas : ['Improve piece activity and king safety.']).map((focus) => (
                <li key={focus}>{focus}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
