export type StrokeEventType = 'stroke:start' | 'stroke:move' | 'stroke:end'

export type WhiteboardStrokeEvent = {
  type: StrokeEventType
  boardId: string
  strokeId: string
  x: number
  y: number
  t: number
  seq?: number
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

export type WhiteboardHistoryCursor = {
  lastSeq?: number
  lastTs?: string | null
}

export type WhiteboardHistoryResponse = {
  boardId: string
  events: WhiteboardStrokeEvent[]
  cursor: WhiteboardHistoryCursor
}
