import React from 'react'
import type { TutorTab } from './types'

const classes = {
  root: 'inline-flex w-full rounded-xl border border-slate-700 bg-slate-900/60 p-1',
  buttonBase: 'flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
  buttonActive: 'bg-indigo-500/20 text-indigo-100 border border-indigo-300/40',
  buttonInactive: 'text-slate-300 border border-transparent hover:bg-slate-800/80 hover:text-white',
} as const

export default function TutorTabs({
  activeTab,
  allowAnalyzeTab,
  onChange,
}: {
  activeTab: TutorTab
  allowAnalyzeTab: boolean
  onChange: (tab: TutorTab) => void
}): React.JSX.Element {
  return (
    <div className={classes.root} role="group" aria-label="Tutor tabs">
      <button
        type="button"
        onClick={() => onChange('lesson')}
        aria-pressed={activeTab === 'lesson'}
        className={`${classes.buttonBase} ${activeTab === 'lesson' ? classes.buttonActive : classes.buttonInactive}`}
      >
        How to play
      </button>
      <button
        type="button"
        onClick={() => onChange('history')}
        aria-pressed={activeTab === 'history'}
        className={`${classes.buttonBase} ${activeTab === 'history' ? classes.buttonActive : classes.buttonInactive}`}
      >
        Chess history
      </button>
      {allowAnalyzeTab ? (
        <button
          type="button"
          onClick={() => onChange('analyze')}
          aria-pressed={activeTab === 'analyze'}
          className={`${classes.buttonBase} ${activeTab === 'analyze' ? classes.buttonActive : classes.buttonInactive}`}
        >
          Analyze game
        </button>
      ) : null}
    </div>
  )
}
