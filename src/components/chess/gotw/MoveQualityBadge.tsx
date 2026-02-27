import React from 'react'
import type { PlyAnalysis } from '../../../data/chessGotw.types'
import { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '../../../data/chessGotw.types'

type MoveQualityBadgeProps = {
  currentPly: number
  currentMoveSan: string | null
  analysis: PlyAnalysis | undefined
  prefersReducedMotion: boolean | null
}

export default function MoveQualityBadge({
  currentPly,
  currentMoveSan,
  analysis,
  prefersReducedMotion,
}: MoveQualityBadgeProps): React.JSX.Element | null {
  if (!analysis || !currentMoveSan) return null

  const label = CLASSIFICATION_LABELS[analysis.classification]
  const colors = CLASSIFICATION_COLORS[analysis.classification]

  const announceText = `Move ${currentPly}. ${currentMoveSan}. ${label}. ${analysis.short}`

  return (
    <>
      <div
        data-testid="gotw-move-quality-badge"
        role="status"
        className={`
          mx-auto mb-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1
          text-xs font-semibold ring-1 ring-white/10
          ${colors.bg} ${colors.text}
          ${prefersReducedMotion ? '' : 'animate-fade-in'}
        `}
      >
        <span className="text-sm font-bold">{analysis.symbol}</span>
        <span>{label}</span>
        <span className="opacity-70">—</span>
        <span className="opacity-90">{analysis.short}</span>
      </div>

      {/* Screen-reader announcement region; visually hidden */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announceText}
      </div>
    </>
  )
}
