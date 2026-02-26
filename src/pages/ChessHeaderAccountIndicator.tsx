import React from 'react'
import { ChevronDown } from 'lucide-react'

type ChessHeaderAccountIndicatorProps = {
  isAuthenticated: boolean
  displayName: string
  initials: string
  onSignIn: () => void
}

export default function ChessHeaderAccountIndicator({
  isAuthenticated,
  displayName,
  initials,
  onSignIn,
}: ChessHeaderAccountIndicatorProps): React.JSX.Element {
  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        className="inline-flex min-h-10 items-center justify-center rounded-md px-2 text-xs font-semibold text-chess-muted transition hover:text-chess-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
        aria-label="Sign in"
      >
        Sign in
      </button>
    )
  }

  return (
    <button
      type="button"
      className="inline-flex min-h-10 max-w-[10.5rem] items-center gap-1.5 rounded-md px-1.5 py-1 text-chess-text transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
      aria-label={`Account menu for ${displayName}`}
    >
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chess-surfaceSoft text-[10px] font-bold uppercase text-chess-accentSoft ring-1 ring-white/15"
        aria-hidden="true"
      >
        {initials}
      </span>
      <span className="truncate text-xs font-medium">{displayName}</span>
      <ChevronDown size={12} className="shrink-0 text-chess-muted" aria-hidden="true" />
    </button>
  )
}
