import React from 'react'

type PlayerBadgeProps = {
  color: 'white' | 'black'
  name: string
  rating?: string | null
  className?: string
  testId?: string
}

function formatRating(rating?: string | null): string {
  const normalized = (rating || '').trim()
  return normalized.length ? normalized : '—'
}

export default function PlayerBadge({
  color,
  name,
  rating,
  className = '',
  testId,
}: PlayerBadgeProps): React.JSX.Element {
  const colorLabel = color === 'black' ? 'Black' : 'White'

  return (
    <div
      className={`flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm font-medium text-chess-text ring-1 ring-white/10 ${className}`.trim()}
      data-testid={testId}
    >
      <span className="font-semibold text-chess-text/95">{colorLabel}: {name}</span>
      <span className="text-chess-text/80">({formatRating(rating)})</span>
    </div>
  )
}
