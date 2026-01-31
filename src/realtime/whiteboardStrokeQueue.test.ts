import { describe, expect, it, vi } from 'vitest'
import { createStrokePersistenceQueue, createStrokeSegmenter } from './whiteboardStrokeQueue'

const buildEvent = (overrides?: Partial<{ strokeId: string; segmentIndex: number; type: 'stroke:start' | 'stroke:move' | 'stroke:end' }>) => ({
  type: overrides?.type ?? 'stroke:move',
  boardId: 'board-1',
  strokeId: overrides?.strokeId ?? 'stroke-1',
  x: 0.1,
  y: 0.2,
  t: 1,
  segmentIndex: overrides?.segmentIndex ?? 0,
})

describe('whiteboardStrokeQueue', () => {
  it('flushes pending events on stroke end', () => {
    const send = vi.fn()
    const queue = createStrokePersistenceQueue({ send, baseDelayMs: 50, maxDelayMs: 50 })

    const start = buildEvent({ type: 'stroke:start', segmentIndex: 0 })
    const end = buildEvent({ type: 'stroke:end', segmentIndex: 1 })

    queue.enqueue(start)
    queue.enqueue(end)
    queue.flush('stroke-end')

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'stroke:end', segmentIndex: 1 }))
  })

  it('retries sending when no ack arrives', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const queue = createStrokePersistenceQueue({ send, baseDelayMs: 100, maxDelayMs: 100 })

    queue.enqueue(buildEvent({ segmentIndex: 0 }))
    expect(send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(120)
    expect(send).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('delays sends during backoff windows', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const queue = createStrokePersistenceQueue({ send, baseDelayMs: 100, maxDelayMs: 100 })

    queue.backoff(500)
    queue.enqueue(buildEvent({ segmentIndex: 5 }))

    expect(send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(send).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('backs off sending when rate limited', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const queue = createStrokePersistenceQueue({ send, baseDelayMs: 50, maxDelayMs: 50 })

    queue.backoff(200)
    queue.enqueue(buildEvent({ segmentIndex: 4 }))

    expect(send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(220)
    expect(send).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('de-duplicates pending segments by segmentIndex', () => {
    const send = vi.fn()
    const queue = createStrokePersistenceQueue({ send })

    const evt = buildEvent({ segmentIndex: 3 })
    queue.enqueue(evt)
    queue.enqueue(evt)

    expect(queue.getPendingCount()).toBe(1)
  })

  it('increments segment indices per stroke', () => {
    const segmenter = createStrokeSegmenter()

    expect(segmenter.nextSegmentIndex('stroke-1')).toBe(0)
    expect(segmenter.nextSegmentIndex('stroke-1')).toBe(1)
    expect(segmenter.nextSegmentIndex('stroke-2')).toBe(0)
  })
})
