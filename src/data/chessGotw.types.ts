export type PlyClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'book'
  | 'forced'

export type PlySymbol = '!!' | '!' | '=' | '!?' | '?!' | '?' | '??'

export type PlyAnalysis = {
  ply: number
  classification: PlyClassification
  symbol: PlySymbol
  short: string
  detail?: string
  evalBefore?: number
  evalAfter?: number
  cpLoss?: number
  bestMoveSan?: string
}

export type GotwChapter = {
  ply: number
  title: string
  prompt?: string
  choices?: Array<{ san: string; correct?: boolean }>
  revealText?: string
}

export type GotwAnalysisPack = {
  byPly: Record<number, PlyAnalysis>
  chapters: GotwChapter[]
}

/** Maps classification to a human-friendly label */
export const CLASSIFICATION_LABELS: Record<PlyClassification, string> = {
  brilliant: 'Brilliant',
  great: 'Great move',
  best: 'Best move',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  book: 'Book move',
  forced: 'Forced',
}

/** Badge color tokens per classification (Tailwind classes) */
export const CLASSIFICATION_COLORS: Record<PlyClassification, { bg: string; text: string }> = {
  brilliant: { bg: 'bg-cyan-500/20', text: 'text-cyan-300' },
  great: { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  best: { bg: 'bg-green-500/20', text: 'text-green-300' },
  good: { bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
  inaccuracy: { bg: 'bg-yellow-500/20', text: 'text-yellow-300' },
  mistake: { bg: 'bg-orange-500/20', text: 'text-orange-300' },
  blunder: { bg: 'bg-red-500/20', text: 'text-red-300' },
  book: { bg: 'bg-gray-500/20', text: 'text-gray-300' },
  forced: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
}
