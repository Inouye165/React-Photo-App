import type { StrokeEventType, WhiteboardStrokeEvent } from '../types/whiteboard'

const TYPE_ORDER: Record<StrokeEventType, number> = {
  'stroke:start': 0,
  'stroke:move': 1,
  'stroke:end': 2,
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function normalizeHistoryEvents(events: WhiteboardStrokeEvent[]): WhiteboardStrokeEvent[] {
  const filtered = events.filter((evt) => isFiniteNumber(evt.x) && isFiniteNumber(evt.y) && isFiniteNumber(evt.t))
  const hasSeq = filtered.some((evt) => isFiniteNumber(evt.seq))
  if (!hasSeq) return filtered

  return filtered.slice().sort((a, b) => {
    const aSeq = isFiniteNumber(a.seq) ? a.seq : Number.MAX_SAFE_INTEGER
    const bSeq = isFiniteNumber(b.seq) ? b.seq : Number.MAX_SAFE_INTEGER
    if (aSeq !== bSeq) return aSeq - bSeq
    if (a.t !== b.t) return a.t - b.t
    if (a.strokeId !== b.strokeId) return a.strokeId.localeCompare(b.strokeId)
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  })
}
