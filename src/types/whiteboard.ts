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

export type ExcalidrawSnapshotElement = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  angle?: number
  strokeColor?: string
  strokeWidth?: number
  backgroundColor?: string
  fillStyle?: string
  opacity?: number
  points?: number[][]
  isDeleted?: boolean
  customData?: Record<string, unknown>
  text?: string
  fontSize?: number
  fontFamily?: string
  textColor?: string
  fileId?: string
  scale?: [number, number]
  status?: string
}

export type ExcalidrawSnapshotFile = {
  id: string
  dataURL?: string
  mimeType?: string
  created?: number
  lastRetrieved?: number
}

export type WhiteboardSnapshotResponse = WhiteboardHistoryResponse & {
  excalidrawElements?: ExcalidrawSnapshotElement[]
  excalidrawFiles?: Record<string, ExcalidrawSnapshotFile>
}

export type WhiteboardHubUser = {
  id: string
  username: string | null
  avatar_url: string | null
}

export type WhiteboardHubItem = {
  id: string
  name: string | null
  created_at: string
  updated_at: string
  type?: string | null
  metadata?: unknown
  owner: WhiteboardHubUser | null
  participants: WhiteboardHubUser[]
}

export type WhiteboardSessionDetails = {
  id: string
  name: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

export type WhiteboardTutorRole = 'user' | 'assistant'

export type WhiteboardTutorMessage = {
  role: WhiteboardTutorRole
  content: string
}

export type WhiteboardTutorStep = {
  number: number
  label: string
  studentWork: string
  correct: boolean
  neutral: boolean
  explanation: string
}

export type WhiteboardTutorErrorItem = {
  stepNumber: number
  issue: string
  correction: string
}

export type WhiteboardTutorSections = {
  problem: string
  stepsAnalysis: string
  errorsFound: string
  encouragement: string
}

export type WhiteboardTutorResponse = {
  reply: string
  messages: WhiteboardTutorMessage[]
  sections: WhiteboardTutorSections
  problem: string
  correctSolution: string
  scoreCorrect: number
  scoreTotal: number
  steps: WhiteboardTutorStep[]
  errorsFound: WhiteboardTutorErrorItem[]
  closingEncouragement: string
}

export type WhiteboardTutorRequest = {
  imageDataUrl: string
  imageMimeType?: string
  imageName?: string
  audienceAge?: number
  messages?: WhiteboardTutorMessage[]
  mode?: 'analysis' | 'tutor' | 'chat'
}
