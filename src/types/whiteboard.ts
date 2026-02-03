export type StrokeEventType = 'stroke:start' | 'stroke:move' | 'stroke:end'

export type WhiteboardStrokeEvent = {
  type: StrokeEventType
  boardId: string
  strokeId: string
  x: number
  y: number
  t: number
  seq?: number
  segmentIndex?: number
  sourceId?: string
  color?: string
  width?: number
}

export type WhiteboardClearEvent = {
  type: 'whiteboard:clear'
  boardId: string
  t: number
  sourceId?: string
}

export type WhiteboardEvent = WhiteboardStrokeEvent | WhiteboardClearEvent

export type WhiteboardStrokeAck = {
  boardId: string
  strokeId: string
  segmentIndex: number
  type?: StrokeEventType
  seq?: number
}

export type WhiteboardServerErrorCode =
  | 'rate_limited'
  | 'payload_too_large'
  | 'invalid_request'
  | 'invalid_payload'
  | 'forbidden'
  | 'join_failed'
  | 'not_joined'
  | 'unknown'

export type WhiteboardServerError = {
  code: WhiteboardServerErrorCode
  boardId?: string
  strokeId?: string
}

export type WhiteboardHistoryCursor = {
  lastSeq?: number
  lastTs?: string | null
}

export type WhiteboardHistoryResponse = {
  boardId: string
  events: WhiteboardStrokeEvent[]
  cursor: WhiteboardHistoryCursor
}

export type WhiteboardSnapshotResponse = WhiteboardHistoryResponse
