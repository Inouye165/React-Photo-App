import React from 'react'
import type { PlyAnalysis, GotwChapter } from '../../../data/chessGotw.types'
import { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '../../../data/chessGotw.types'
import GotwCoachPrompt from './GotwCoachPrompt'

type GotwCurrentInsightPanelProps = {
  currentPly: number
  currentMoveSan: string | null
  analysis: PlyAnalysis | undefined
  activeChapter: GotwChapter | null
  isGuidedMode: boolean
  moveComment: string
  prefersReducedMotion: boolean | null
  onCoachContinue: () => void
}

/**
 * Stable-height insight panel that lives beside (desktop) or replaces
 * the old variable-height commentary slot. All content scrolls internally
 * so it never pushes layout around.
 */
export default function GotwCurrentInsightPanel({
  currentPly,
  currentMoveSan,
  analysis,
  activeChapter,
  isGuidedMode,
  moveComment,
  prefersReducedMotion,
  onCoachContinue,
}: GotwCurrentInsightPanelProps): React.JSX.Element {
  const showCoach = isGuidedMode && activeChapter !== null

  const label = analysis ? CLASSIFICATION_LABELS[analysis.classification] : null
  const colors = analysis ? CLASSIFICATION_COLORS[analysis.classification] : null

  const announceText = analysis && currentMoveSan
    ? `Move ${currentPly}. ${currentMoveSan}. ${label}. ${analysis.short}`
    : undefined

  return (
    <div
      data-testid="gotw-insight-panel"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10"
    >
      {/* Move quality badge — rendered inside panel, not above the board */}
      {analysis && currentMoveSan ? (
        <div className="mb-3">
          <div
            data-testid="gotw-move-quality-badge"
            role="status"
            className={`
              inline-flex items-center gap-1.5 rounded-full px-3 py-1.5
              text-sm font-semibold ring-1 ring-white/10
              ${colors!.bg} ${colors!.text}
              ${prefersReducedMotion ? '' : 'animate-fade-in'}
            `}
          >
            <span className="text-base font-bold">{analysis.symbol}</span>
            <span>{label}</span>
            <span className="opacity-70">—</span>
            <span className="opacity-90">{analysis.short}</span>
          </div>

          {/* Screen-reader announcement */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {announceText}
          </div>
        </div>
      ) : null}

      {/* Header with current move context */}
      <div className="mb-2">
        <h3 className="font-display text-base text-chess-text">
          {showCoach ? 'Key Moment' : 'Current Insight'}
        </h3>
        {currentMoveSan ? (
          <p className="mt-0.5 text-sm text-chess-text/60">
            Move {Math.ceil(currentPly / 2)}{currentPly % 2 === 0 ? '...' : '.'} {currentMoveSan}
          </p>
        ) : null}
      </div>

      {/* Coach prompt takes priority when guided */}
      {showCoach ? (
        <GotwCoachPrompt
          key={activeChapter!.ply}
          chapter={activeChapter!}
          onContinue={onCoachContinue}
        />
      ) : (
        <div className="space-y-2">
          {/* Analysis detail — large readable text */}
          {analysis?.detail ? (
            <p className="text-base leading-relaxed text-chess-text/90">
              {analysis.detail}
            </p>
          ) : null}

          {/* Move commentary fallback */}
          {!analysis?.detail && moveComment ? (
            <p className="text-base leading-relaxed text-chess-text/85">
              {moveComment}
            </p>
          ) : null}

          {/* When both exist, show commentary as secondary */}
          {analysis?.detail && moveComment ? (
            <p className="text-sm leading-relaxed text-chess-text/60">
              {moveComment}
            </p>
          ) : null}

          {/* Empty state */}
          {!analysis?.detail && !moveComment ? (
            <p className="text-sm italic text-chess-text/40">
              Select an annotated move to see commentary.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
