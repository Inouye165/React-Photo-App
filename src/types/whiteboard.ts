export type StrokeEventType = 'stroke:start' | 'stroke:move' | 'stroke:end'

export type WhiteboardStrokeEvent = {
  type: StrokeEventType
  boardId: string
  strokeId: string
  x: number
  y: number
  t: number
  sourceId?: string
  color?: string
  width?: number
}

export type WhiteboardHistoryCursor = {
  lastSeq: number
  lastTs: string | null
}

export type WhiteboardHistoryResponse = {
  boardId: string
  events: WhiteboardStrokeEvent[]
  cursor: WhiteboardHistoryCursor
}

export type WhiteboardSnapshotResponse = WhiteboardHistoryResponse
