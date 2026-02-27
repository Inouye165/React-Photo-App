import React, { useEffect, useRef } from 'react'
import type { PlyAnalysis } from '../../../data/chessGotw.types'
import type { ReplayPly } from '../../../data/chessGotw'
import { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '../../../data/chessGotw.types'

type AnalysisTabProps = {
  moves: ReplayPly[]
  analysisByPly: Record<number, PlyAnalysis>
  currentPly: number
  onSelectPly: (ply: number) => void
}

export default function AnalysisTab({
  moves,
  analysisByPly,
  currentPly,
  onSelectPly,
}: AnalysisTabProps): React.JSX.Element {
  const listRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    if (currentPly <= 0) return
    const el = listRef.current?.querySelector<HTMLButtonElement>(`button[data-analysis-ply="${currentPly}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [currentPly])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 rounded-md border border-white/10 bg-chess-surfaceSoft px-3 py-2 text-xs font-bold uppercase tracking-wide text-chess-text/80">
        Move-by-Move Analysis
      </div>
      <ol ref={listRef} data-testid="gotw-analysis-list" className="mt-2 min-h-0 flex-1 space-y-0 overflow-y-auto pr-1">
        {moves.map((move) => {
          const analysis = analysisByPly[move.ply]
          const isCurrent = move.ply === currentPly
          const moveNum = Math.ceil(move.ply / 2)
          const side = move.ply % 2 === 1 ? 'W' : 'B'

          return (
            <li key={move.ply}>
              <button
                type="button"
                data-analysis-ply={move.ply}
                onClick={() => onSelectPly(move.ply)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`
                  flex w-full items-start gap-2 border-b border-white/5 px-3 py-2.5 text-left text-base transition
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-1 focus-visible:ring-offset-chess-bg
                  ${isCurrent ? 'bg-chess-accent/20 text-chess-accentSoft' : 'text-chess-text/85 hover:bg-white/5'}
                `}
              >
                <span className="shrink-0 w-10 font-mono text-sm text-chess-text/60">
                  {moveNum}.{side === 'B' ? '..' : ''}
                </span>
                <span className={`shrink-0 w-10 font-semibold text-base ${isCurrent ? 'text-chess-accentSoft' : ''}`}>
                  {move.san}
                </span>
                <span className="min-w-0 flex-1">
                  {analysis ? (
                    <span className="flex flex-col gap-0.5">
                      <span className={`inline-flex items-center gap-1 text-sm font-semibold ${CLASSIFICATION_COLORS[analysis.classification].text}`}>
                        <span>{analysis.symbol}</span>
                        <span>{CLASSIFICATION_LABELS[analysis.classification]}</span>
                        <span className="opacity-70">— {analysis.short}</span>
                      </span>
                      {analysis.detail ? (
                        <span className="text-sm leading-relaxed text-chess-text/60">{analysis.detail}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-sm text-chess-text/30 italic">No note for this move</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
