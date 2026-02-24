import type React from 'react'
import type { Square } from 'chess.js'

export type TutorTab = 'lesson' | 'history' | 'analyze'
export type LessonSection = 'pieces' | 'board-notation' | 'attacks' | 'discovered-check'

export type ChessLesson = {
  piece: string
  value: string
  explanation: string
  movement: string
  frames: string[]
  highlightSquares: string[]
}

export type NotationGuideRow = {
  algebraic: string
  descriptive: string
  meaning: string
}

export type NotationLineMove = {
  san: string
  descriptive: string
  explanation: string
  from: Square
  to: Square
  focusSquares: string[]
}

export type TacticalPattern = {
  name: string
  explanation: string
  teachingNote: string
  san: string
  descriptive: string
  frames: string[]
  highlightSquares: string[]
  frameHighlights?: string[][]
  frameArrows?: Array<Array<[Square, Square]>>
  frameLabels?: string[]
}

export type ChessHistoryEvent = {
  period: string
  title: string
  summary: string
  ruleChange: string
  imageUrl: string
  imageAlt: string
}

export type ChessStory = {
  id: string
  title: string
  pdfUrl: string
  audioSlug: string
}

export type LessonSectionOption = {
  id: LessonSection
  label: string
}

export type LessonSquareStylesBuilder = (squares: string[]) => Record<string, React.CSSProperties>

export type TutorBoardRenderState = {
  position: string
  customArrows: Array<[Square, Square]>
  customSquareStyles: Record<string, React.CSSProperties>
  notationOverlay: {
    show: boolean
    targetX: number
    targetY: number
    targetFile: string
    targetRank: string
    moveLabel: string | null
    files: readonly string[]
    ranks: readonly string[]
  }
}
