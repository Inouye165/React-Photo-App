import React from 'react'
import type { LessonSection, ChessLesson, NotationGuideRow, NotationLineMove, TacticalPattern, LessonSectionOption, ChessStory } from './types'

const classes = {
  panel: 'rounded-2xl border border-slate-700 bg-slate-900/60 p-4',
  topRow: 'flex items-center justify-between gap-2',
  title: 'text-xs font-semibold uppercase tracking-wide text-slate-400',
  button: 'rounded-md border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
  activeButton: 'border-indigo-300/60 bg-indigo-500/20 text-indigo-100',
  inactiveButton: 'border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-800',
} as const

export default function LessonPanel({
  activeLessonSection,
  setActiveLessonSection,
  lessonSections,
  stories,
  activeStoryId,
  setActiveStoryId,
  onOpenStory,
  showStoryHint,
  onDismissStoryHint,
  activeLesson,
  activeLessonIndex,
  setActiveLessonIndex,
  lessons,
  notationAutoplay,
  setNotationAutoplay,
  notationFocus,
  setNotationFocus,
  notationPly,
  setNotationPly,
  notationMoves,
  notationGuideRows,
  patternAutoplay,
  setPatternAutoplay,
  patterns,
  activePatternIndex,
  setActivePatternIndex,
  patternFrame,
  setPatternFrame,
  activePattern,
  discoveredCheckAutoplay,
  setDiscoveredCheckAutoplay,
  discoveredCheckFrame,
  setDiscoveredCheckFrame,
  discoveredCheckPattern,
}: {
  activeLessonSection: LessonSection
  setActiveLessonSection: (value: LessonSection) => void
  lessonSections: LessonSectionOption[]
  stories: ChessStory[]
  activeStoryId: string
  setActiveStoryId: (value: string) => void
  onOpenStory: () => void
  showStoryHint: boolean
  onDismissStoryHint: () => void
  activeLesson: ChessLesson
  activeLessonIndex: number
  setActiveLessonIndex: (value: number) => void
  lessons: ChessLesson[]
  notationAutoplay: boolean
  setNotationAutoplay: (value: boolean | ((prev: boolean) => boolean)) => void
  notationFocus: 'rank' | 'file' | 'move'
  setNotationFocus: (value: 'rank' | 'file' | 'move') => void
  notationPly: number
  setNotationPly: (value: number | ((prev: number) => number)) => void
  notationMoves: NotationLineMove[]
  notationGuideRows: NotationGuideRow[]
  patternAutoplay: boolean
  setPatternAutoplay: (value: boolean | ((prev: boolean) => boolean)) => void
  patterns: TacticalPattern[]
  activePatternIndex: number
  setActivePatternIndex: (value: number) => void
  patternFrame: number
  setPatternFrame: (value: number) => void
  activePattern: TacticalPattern
  discoveredCheckAutoplay: boolean
  setDiscoveredCheckAutoplay: (value: boolean | ((prev: boolean) => boolean)) => void
  discoveredCheckFrame: number
  setDiscoveredCheckFrame: (value: number) => void
  discoveredCheckPattern: TacticalPattern
}): React.JSX.Element {
  return (
    <div className={classes.panel}>
      <div className={classes.topRow}>
        <div className={classes.title}>How to play</div>
        <div className="flex items-center gap-2">
          <select
            value={activeStoryId}
            onChange={(event) => setActiveStoryId(event.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100"
            aria-label="Choose story"
          >
            {stories.map((story) => (
              <option key={story.id} value={story.id}>{story.title}</option>
            ))}
          </select>
          <div className="relative">
            <button
              type="button"
              onClick={onOpenStory}
              className="rounded-md border border-indigo-300/60 bg-indigo-500/20 px-2.5 py-1.5 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/30"
            >
              Story mode
            </button>
            {showStoryHint ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-indigo-300/30 bg-slate-900 p-2 text-xs text-slate-200 shadow-xl">
                <div className="font-semibold text-indigo-100">New here? Try Story mode ✨</div>
                <p className="mt-1 text-slate-300">Start with tutorials, then open Story mode for guided chapters.</p>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button type="button" onClick={onDismissStoryHint} className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-semibold text-slate-200">Dismiss</button>
                  <button type="button" onClick={onOpenStory} className="rounded border border-indigo-300/50 bg-indigo-500/20 px-2 py-1 font-semibold text-indigo-100">Open story</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="inline-flex min-w-max gap-1.5">
          {lessonSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveLessonSection(section.id)}
              className={`${classes.button} ${activeLessonSection === section.id ? classes.activeButton : classes.inactiveButton}`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3">
        {activeLessonSection === 'pieces' ? (
          <div className="space-y-2">
            <div className={classes.title}>Pieces & movement</div>
            <p className="text-xs text-slate-300">These examples use full-board positions from realistic openings/endgames instead of isolated single-piece boards.</p>
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex min-w-max gap-1.5">
                {lessons.map((lesson, index) => (
                  <button key={lesson.piece} type="button" onClick={() => setActiveLessonIndex(index)} className={`${classes.button} ${index === activeLessonIndex ? classes.activeButton : classes.inactiveButton}`}>{lesson.piece}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">{activeLesson.piece}</div>
              <div className="text-xs text-slate-400">Piece value: {activeLesson.value}</div>
              <p className="mt-1 text-sm text-slate-200">{activeLesson.explanation}</p>
              <p className="mt-1 text-xs text-slate-300">{activeLesson.movement}</p>
            </div>
          </div>
        ) : activeLessonSection === 'board-notation' ? (
          <div className="space-y-2">
            <div className={classes.topRow}>
              <div className={classes.title}>Board & notation</div>
              <button type="button" onClick={() => setNotationAutoplay((prev) => !prev)} className={`${classes.button} ${classes.inactiveButton}`}>
                {notationAutoplay ? 'Pause autoplay' : 'Start autoplay'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setNotationFocus('rank')} className={`${classes.button} ${notationFocus === 'rank' ? classes.activeButton : classes.inactiveButton}`}>Ranks (1–8)</button>
              <button type="button" onClick={() => setNotationFocus('file')} className={`${classes.button} ${notationFocus === 'file' ? classes.activeButton : classes.inactiveButton}`}>Files (a–h)</button>
              <button type="button" onClick={() => setNotationFocus('move')} className={`${classes.button} ${notationFocus === 'move' ? classes.activeButton : classes.inactiveButton}`}>Move coordinates</button>
            </div>
            {notationFocus === 'rank' ? <p className="text-sm font-semibold text-slate-100">Ranks are the row numbers 1–8. Follow the glowing number on the board edge to the target square.</p> : null}
            {notationFocus === 'file' ? <p className="text-sm font-semibold text-slate-100">Files are the column letters a–h. Follow the glowing letter on the board edge to the target square.</p> : null}
            {notationFocus === 'move' ? <p className="text-sm font-semibold text-slate-100">When a move appears, read source → target (example: e2 → e4) and trace the guide line to the square.</p> : null}
            <p className="text-xs text-slate-300">Algebraic notation names the destination square. Older descriptive notation uses names like K, QB, and KN files.</p>
            <div className="overflow-hidden rounded border border-slate-700 bg-slate-900/80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-300">
                  <tr><th className="px-2 py-1 font-semibold">Algebraic</th><th className="px-2 py-1 font-semibold">Older descriptive</th><th className="px-2 py-1 font-semibold">Meaning</th></tr>
                </thead>
                <tbody>
                  {notationGuideRows.map((row) => (
                    <tr key={`${row.algebraic}-${row.descriptive}`} className="border-t border-slate-700 text-slate-200">
                      <td className="px-2 py-1 font-semibold">{row.algebraic}</td>
                      <td className="px-2 py-1">{row.descriptive}</td>
                      <td className="px-2 py-1 text-slate-300">{row.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setNotationPly((prev) => Math.max(0, prev - 1))} disabled={notationPly === 0} className={`${classes.button} ${classes.inactiveButton} disabled:cursor-not-allowed disabled:opacity-50`}>Previous move</button>
              <button type="button" onClick={() => setNotationPly((prev) => Math.min(notationMoves.length, prev + 1))} disabled={notationPly === notationMoves.length} className={`${classes.button} ${classes.inactiveButton} disabled:cursor-not-allowed disabled:opacity-50`}>Next move</button>
              <span className="text-[11px] text-slate-400">Move {notationPly}/{notationMoves.length}</span>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {notationMoves.map((move, index) => {
                const isActive = index + 1 === notationPly
                const isPast = index + 1 < notationPly
                return (
                  <button key={`${index + 1}-${move.san}`} type="button" onClick={() => setNotationPly(index + 1)} aria-current={isActive ? 'step' : undefined} className={`w-full rounded border px-2 py-1 text-left text-xs ${isActive ? 'border-indigo-300/60 bg-indigo-500/20 text-indigo-100' : isPast ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100' : 'border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800'}`}>
                    <span className="font-semibold">{index + 1}. {move.san}</span>
                    <span className="ml-2 text-[11px]">({move.descriptive})</span>
                    <div className="mt-0.5 text-[11px] text-slate-400">{move.explanation}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : activeLessonSection === 'attacks' ? (
          <div className="space-y-2">
            <div className={classes.topRow}>
              <div className={classes.title}>Attacks (fork, discovered, pinned, etc.)</div>
              <button type="button" onClick={() => setPatternAutoplay((prev) => !prev)} className={`${classes.button} ${classes.inactiveButton}`}>{patternAutoplay ? 'Pause autoplay' : 'Start autoplay'}</button>
            </div>
            <p className="text-xs text-slate-300">Use the pattern buttons to cycle through common tactical motifs.</p>
            <div className="overflow-x-auto pb-1"><div className="inline-flex min-w-max gap-1.5">{patterns.map((pattern, index) => (<button key={pattern.name} type="button" onClick={() => setActivePatternIndex(index)} className={`${classes.button} ${index === activePatternIndex ? classes.activeButton : classes.inactiveButton}`}>{pattern.name}</button>))}</div></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPatternFrame(0)} disabled={patternFrame === 0} className={`${classes.button} ${classes.inactiveButton} disabled:cursor-not-allowed disabled:opacity-50`}>Show setup</button>
              <button type="button" onClick={() => setPatternFrame(activePattern.frames.length - 1)} disabled={patternFrame === activePattern.frames.length - 1} className={`${classes.button} ${classes.inactiveButton} disabled:cursor-not-allowed disabled:opacity-50`}>Show key idea</button>
              <span className="text-[11px] text-slate-400">Frame {patternFrame + 1}/{activePattern.frames.length}</span>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/70 p-2">
              <div className="text-xs font-semibold text-slate-100">{activePattern.name}</div>
              <p className="mt-1 text-[11px] text-slate-400">{activePattern.frameLabels?.[patternFrame] ?? `Frame ${patternFrame + 1}`}</p>
              <p className="mt-1 text-xs text-slate-300">{activePattern.explanation}</p>
              <p className="mt-1 text-xs text-slate-300"><span className="font-semibold">What to notice:</span> {activePattern.teachingNote}</p>
              <p className="mt-1 text-xs text-slate-300"><span className="font-semibold">Notation:</span> {activePattern.san} | {activePattern.descriptive}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={classes.topRow}>
              <div className={classes.title}>Discovered check</div>
              <button type="button" onClick={() => setDiscoveredCheckAutoplay((prev) => !prev)} className={`${classes.button} ${classes.inactiveButton}`}>{discoveredCheckAutoplay ? 'Pause autoplay' : 'Start autoplay'}</button>
            </div>
            <p className="text-xs text-slate-300">This is taught right after discovered attacks so students can see the same idea now targeting the king.</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDiscoveredCheckFrame(0)} disabled={discoveredCheckFrame === 0} className={`${classes.button} ${classes.inactiveButton} disabled:cursor-not-allowed disabled:opacity-50`}>Show setup</button>
              <button type="button" onClick={() => setDiscoveredCheckFrame(discoveredCheckPattern.frames.length - 1)} disabled={discoveredCheckFrame === discoveredCheckPattern.frames.length - 1} className={`${classes.button} ${classes.inactiveButton} disabled:cursor-not-allowed disabled:opacity-50`}>Show discovered check</button>
              <span className="text-[11px] text-slate-400">Frame {discoveredCheckFrame + 1}/{discoveredCheckPattern.frames.length}</span>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/70 p-2">
              <div className="text-xs font-semibold text-slate-100">{discoveredCheckPattern.name}</div>
              <p className="mt-1 text-[11px] text-slate-400">{discoveredCheckPattern.frameLabels?.[discoveredCheckFrame] ?? `Frame ${discoveredCheckFrame + 1}`}</p>
              <p className="mt-1 text-xs text-slate-300">{discoveredCheckPattern.explanation}</p>
              <p className="mt-1 text-xs text-slate-300"><span className="font-semibold">What to notice:</span> {discoveredCheckPattern.teachingNote}</p>
              <p className="mt-1 text-xs text-slate-300"><span className="font-semibold">Notation:</span> {discoveredCheckPattern.san} | {discoveredCheckPattern.descriptive}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
