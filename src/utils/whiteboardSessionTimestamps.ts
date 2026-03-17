export function parseSessionTimestamp(value?: string | null): number | null {
  if (!value) return null

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function formatRelativeSessionTimestampFromNow(value: string | null | undefined, nowMs: number): string | null {
  const timestamp = parseSessionTimestamp(value)
  if (timestamp === null) return null

  const deltaMinutes = Math.max(0, Math.round((nowMs - timestamp) / 60000))
  if (deltaMinutes < 1) return 'Just now'
  if (deltaMinutes < 60) return `${deltaMinutes} min ago`

  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours} hr${deltaHours === 1 ? '' : 's'} ago`

  const deltaDays = Math.round(deltaHours / 24)
  return `${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`
}