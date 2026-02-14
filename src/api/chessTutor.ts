import { getAuthHeadersAsync } from './auth'
import { request } from './httpClient'

export type ChessTutorAnalysis = {
  positionSummary: string
  hints: string[]
  focusAreas: string[]
}

export type ChessTutorResult = {
  analysis: ChessTutorAnalysis
  model: string
  apiVersion?: string
}

type AnalyzeChessTutorResponse = {
  success: boolean
  analysis?: ChessTutorAnalysis
  model?: string
  apiVersion?: string
  error?: string
}

export async function analyzeGameForMe(input: {
  fen: string
  moves: string[]
}): Promise<ChessTutorResult> {
  const headers = await getAuthHeadersAsync(true)

  const response = await request<AnalyzeChessTutorResponse>({
    path: '/api/v1/chess-tutor/analyze',
    method: 'POST',
    headers,
    body: {
      fen: input.fen,
      moves: input.moves,
    },
  })

  if (!response?.success || !response.analysis) {
    throw new Error(response?.error || 'Failed to analyze game')
  }

  return {
    analysis: response.analysis,
    model: response.model || 'gemini',
    apiVersion: response.apiVersion,
  }
}
