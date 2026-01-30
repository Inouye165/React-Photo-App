import type { WhiteboardHistoryCursor, WhiteboardStrokeEvent } from '../types/whiteboard'
import { normalizeHistoryEvents } from './whiteboardReplay'

const MAX_CACHED_EVENTS = 5000

type CacheEntry = {
  events: WhiteboardStrokeEvent[]
  cursor: WhiteboardHistoryCursor | null
  updatedAt: number
}

const cache = new Map<string, CacheEntry>()

export function getWhiteboardSnapshotCache(boardId: string): CacheEntry | null {
  return cache.get(boardId) ?? null
}

export function setWhiteboardSnapshotCache(
  boardId: string,
  events: WhiteboardStrokeEvent[],
  cursor: WhiteboardHistoryCursor | null,
): void {
  const trimmed = events.length > MAX_CACHED_EVENTS ? events.slice(-MAX_CACHED_EVENTS) : events
  cache.set(boardId, {
    events: trimmed,
    cursor,
    updatedAt: Date.now(),
  })
}

export function appendWhiteboardSnapshotCache(boardId: string, event: WhiteboardStrokeEvent): void {
  const entry = cache.get(boardId)
  const nextEvents = entry ? [...entry.events, event] : [event]
  const last = entry?.events[entry.events.length - 1]
  const needsSort = typeof event.seq === 'number' && typeof last?.seq === 'number' && event.seq < last.seq
  const ordered = needsSort ? normalizeHistoryEvents(nextEvents) : nextEvents
  const trimmed = ordered.length > MAX_CACHED_EVENTS ? ordered.slice(-MAX_CACHED_EVENTS) : ordered
  cache.set(boardId, {
    events: trimmed,
    cursor: entry?.cursor ?? null,
    updatedAt: Date.now(),
  })
}

export function clearWhiteboardSnapshotCache(boardId: string): void {
  const entry = cache.get(boardId)
  if (!entry) return
  cache.set(boardId, { events: [], cursor: entry.cursor, updatedAt: Date.now() })
}
