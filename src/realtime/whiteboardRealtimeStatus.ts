export const WHITEBOARD_REALTIME_MAX_RETRIES = 6

export function getWhiteboardRealtimeStatusAfterDisconnect(
  reconnectAttempts: number,
  maxRetries = WHITEBOARD_REALTIME_MAX_RETRIES,
): 'reconnecting' | 'failed' {
  return reconnectAttempts > maxRetries ? 'failed' : 'reconnecting'
}