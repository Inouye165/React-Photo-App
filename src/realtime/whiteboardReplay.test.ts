import { describe, expect, it } from 'vitest'
import type { WhiteboardStrokeEvent } from '../types/whiteboard'
import { normalizeHistoryEvents } from './whiteboardReplay'

describe('normalizeHistoryEvents', () => {
  it('orders events by seq when present', () => {
    const events: WhiteboardStrokeEvent[] = [
      { type: 'stroke:move', boardId: 'b1', strokeId: 's1', x: 0.2, y: 0.2, t: 2, seq: 2 },
      { type: 'stroke:start', boardId: 'b1', strokeId: 's1', x: 0.1, y: 0.1, t: 1, seq: 1 },
      { type: 'stroke:end', boardId: 'b1', strokeId: 's1', x: 0.3, y: 0.3, t: 3, seq: 3 },
    ]

    const ordered = normalizeHistoryEvents(events)
    expect(ordered.map((evt) => evt.seq)).toEqual([1, 2, 3])
  })

  it('filters events with invalid coordinates', () => {
    const events: WhiteboardStrokeEvent[] = [
      { type: 'stroke:start', boardId: 'b1', strokeId: 's1', x: 0.1, y: 0.1, t: 1, seq: 1 },
      { type: 'stroke:move', boardId: 'b1', strokeId: 's1', x: Number.NaN, y: 0.2, t: 2, seq: 2 },
      { type: 'stroke:end', boardId: 'b1', strokeId: 's1', x: 0.3, y: Infinity, t: 3, seq: 3 },
    ]

    const ordered = normalizeHistoryEvents(events)
    expect(ordered).toHaveLength(1)
    expect(ordered[0].type).toBe('stroke:start')
  })
})
