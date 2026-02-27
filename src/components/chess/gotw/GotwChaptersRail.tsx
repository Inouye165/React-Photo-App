import React from 'react'
import type { GotwChapter } from '../../../data/chessGotw.types'

type GotwChaptersRailProps = {
  chapters: GotwChapter[]
  currentPly: number
  onJumpTo: (ply: number) => void
}

export default function GotwChaptersRail({
  chapters,
  currentPly,
  onJumpTo,
}: GotwChaptersRailProps): React.JSX.Element | null {
  if (chapters.length === 0) return null

  return (
    <nav
      data-testid="gotw-chapters-rail"
      aria-label="Key moments"
      className="flex items-center gap-1.5 overflow-x-auto py-1"
    >
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-chess-text/50">
        Key:
      </span>
      {chapters.map((ch) => {
        const isActive = currentPly === ch.ply
        const isPast = currentPly > ch.ply
        return (
          <button
            key={ch.ply}
            type="button"
            onClick={() => onJumpTo(ch.ply)}
            aria-label={`${ch.title} — ply ${ch.ply}`}
            aria-current={isActive ? 'step' : undefined}
            className={`
              shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 transition
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-1 focus-visible:ring-offset-chess-bg
              ${isActive
                ? 'bg-chess-accent text-black ring-chess-accent'
                : isPast
                  ? 'bg-white/10 text-chess-text/60 ring-white/10'
                  : 'bg-chess-surfaceSoft text-chess-text/80 ring-white/10 hover:bg-white/10'
              }
            `}
          >
            {ch.title}
          </button>
        )
      })}
    </nav>
  )
}
