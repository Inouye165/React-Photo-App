import type { WhiteboardStrokeAck, WhiteboardStrokeEvent } from '../types/whiteboard'

type QueuedStrokeEvent = WhiteboardStrokeEvent & { segmentIndex: number }

type QueueEntry = {
  event: QueuedStrokeEvent
  attempts: number
}

type StrokeQueueOptions = {
  send: (event: QueuedStrokeEvent) => void
  isOnline?: () => boolean
  baseDelayMs?: number
  maxDelayMs?: number
}

const DEFAULT_BASE_DELAY_MS = 400
const DEFAULT_MAX_DELAY_MS = 4000

function buildKey(strokeId: string, segmentIndex: number): string {
  return `${strokeId}:${segmentIndex}`
}

export function createStrokeSegmenter() {
  const nextByStroke = new Map<string, number>()

  return {
    nextSegmentIndex(strokeId: string): number {
      const next = nextByStroke.get(strokeId) ?? 0
      nextByStroke.set(strokeId, next + 1)
      return next
    },
    clearStroke(strokeId: string): void {
      nextByStroke.delete(strokeId)
    },
    reset(): void {
      nextByStroke.clear()
    },
  }
}

export function createStrokePersistenceQueue(options: StrokeQueueOptions) {
  const pending = new Map<string, QueueEntry>()
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const isOnline = options.isOnline ?? (() => (typeof navigator !== 'undefined' ? navigator.onLine : true))

  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let cooldownUntil = 0

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  const scheduleRetry = (delayMs: number) => {
    if (retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      flush('retry')
    }, delayMs)
  }

  const enqueue = (event: QueuedStrokeEvent) => {
    const key = buildKey(event.strokeId, event.segmentIndex)
    if (!pending.has(key)) {
      pending.set(key, { event, attempts: 0 })
    }
    flush('enqueue')
  }

  const ack = (payload: WhiteboardStrokeAck) => {
    const key = buildKey(payload.strokeId, payload.segmentIndex)
    if (pending.delete(key) && pending.size === 0) {
      clearRetry()
    }
  }

  const flush = (_reason: 'enqueue' | 'retry' | 'manual' | 'stroke-end' | 'visibility' | 'unmount' | 'backoff' = 'manual') => {
    if (pending.size === 0) {
      clearRetry()
      return
    }

    const now = Date.now()
    const bypassCooldown = _reason === 'unmount' || _reason === 'stroke-end'
    if (!bypassCooldown && now < cooldownUntil) {
      scheduleRetry(Math.max(0, cooldownUntil - now))
      return
    }

    if (!isOnline()) {
      scheduleRetry(maxDelayMs)
      return
    }

    let maxAttempt = 0
    for (const entry of pending.values()) {
      options.send(entry.event)
      entry.attempts += 1
      maxAttempt = Math.max(maxAttempt, entry.attempts)
    }

    const delay = Math.min(baseDelayMs * Math.pow(2, Math.max(0, maxAttempt - 1)), maxDelayMs)
    if (pending.size > 0) {
      scheduleRetry(delay)
    }
  }

  const backoff = (durationMs: number) => {
    const now = Date.now()
    const nextCooldown = now + Math.max(0, durationMs)
    cooldownUntil = Math.max(cooldownUntil, nextCooldown)
    scheduleRetry(Math.max(0, cooldownUntil - now))
  }

  const getPendingCount = () => pending.size

  const stop = () => {
    clearRetry()
    pending.clear()
  }

  return {
    enqueue,
    ack,
    flush,
    backoff,
    stop,
    getPendingCount,
  }
}
