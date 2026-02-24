import React from 'react'
import type { ChessHistoryEvent } from './types'

const classes = {
  panel: 'rounded-2xl border border-slate-700 bg-slate-900/60 p-4',
  title: 'text-xs font-semibold uppercase tracking-wide text-slate-400',
  body: 'mt-1 text-sm text-slate-300',
  list: 'mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1',
  card: 'rounded-xl border border-slate-700 bg-slate-800/70 p-2.5',
} as const

export default function HistoryPanel({ events }: { events: ChessHistoryEvent[] }): React.JSX.Element {
  return (
    <div className={classes.panel}>
      <div className={classes.title}>Chess History Timeline</div>
      <p className={classes.body}>Scroll from the earliest mentions of chess through major historical rule and strategy changes.</p>
      <div className={classes.list}>
        {events.map((event) => (
          <article key={`${event.period}-${event.title}`} className={classes.card}>
            <img src={event.imageUrl} alt={event.imageAlt} loading="lazy" className="h-28 w-full rounded-lg border border-slate-700 object-cover" />
            <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{event.period}</div>
            <h4 className="text-sm font-semibold text-slate-100">{event.title}</h4>
            <p className="mt-1 text-sm text-slate-300">{event.summary}</p>
            <p className="mt-1 text-xs text-slate-400"><span className="font-semibold">Key change:</span> {event.ruleChange}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
