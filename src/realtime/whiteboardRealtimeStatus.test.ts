import { describe, expect, it } from 'vitest'
import { getWhiteboardRealtimeStatusAfterDisconnect, WHITEBOARD_REALTIME_MAX_RETRIES } from './whiteboardRealtimeStatus'

describe('whiteboardRealtimeStatus', () => {
  it('keeps retrying before the retry budget is exhausted', () => {
    expect(getWhiteboardRealtimeStatusAfterDisconnect(1)).toBe('reconnecting')
    expect(getWhiteboardRealtimeStatusAfterDisconnect(WHITEBOARD_REALTIME_MAX_RETRIES)).toBe('reconnecting')
  })

  it('becomes failed after the retry budget is exhausted', () => {
    expect(getWhiteboardRealtimeStatusAfterDisconnect(WHITEBOARD_REALTIME_MAX_RETRIES + 1)).toBe('failed')
  })
})