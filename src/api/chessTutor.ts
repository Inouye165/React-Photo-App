import { getAuthHeadersAsync } from './auth'
import { request } from './httpClient'
import { ApiError } from './httpClient'

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

export type EnsureStoryAudioResult = {
  cached: boolean
  url: string
  audioBase64?: string
}

export type StoryAudioSetupStatus = {
  configured: {
    supabaseUrl: boolean
    openAiTts: boolean
  }
  bucket: {
    exists: boolean | null
    isPublic: boolean | null
    publicReadProbe: 'ok' | 'forbidden' | 'unreachable' | 'unknown'
  }
  warnings: string[]
}

type AnalyzeChessTutorResponse = {
  success: boolean
  analysis?: ChessTutorAnalysis
  model?: string
  apiVersion?: string
  error?: string
}

type EnsureStoryAudioResponse = {
  success: boolean
  cached?: boolean
  url?: string
  audioBase64?: string
  error?: string
}

type StoryAudioSetupStatusResponse = {
  success: boolean
  configured?: {
    supabaseUrl: boolean
    openAiTts: boolean
  }
  bucket?: {
    exists: boolean | null
    isPublic: boolean | null
    publicReadProbe: 'ok' | 'forbidden' | 'unreachable' | 'unknown'
  }
  warnings?: string[]
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

export async function ensureStoryAudio(input: {
  storySlug: 'architect-of-squares'
  page: number
  totalPages: number
  text: string
  voice?: 'shimmer'
}): Promise<EnsureStoryAudioResult> {
  let response: EnsureStoryAudioResponse
  try {
    response = await request<EnsureStoryAudioResponse>({
      path: '/api/v1/public/story-audio/ensure',
      method: 'POST',
      body: {
        storySlug: input.storySlug,
        page: input.page,
        totalPages: input.totalPages,
        text: input.text,
        voice: input.voice || 'shimmer',
      },
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      response = await request<EnsureStoryAudioResponse>({
        path: '/api/public/story-audio/ensure',
        method: 'POST',
        body: {
          storySlug: input.storySlug,
          page: input.page,
          totalPages: input.totalPages,
          text: input.text,
          voice: input.voice || 'shimmer',
        },
      })
    } else {
      throw error
    }
  }

  if (!response?.success || !response.url) {
    throw new Error(response?.error || 'Failed to prepare story audio')
  }

  return {
    cached: Boolean(response.cached),
    url: response.url,
    audioBase64: response.audioBase64,
  }
}

export async function getStoryAudioSetupStatus(): Promise<StoryAudioSetupStatus> {
  let response: StoryAudioSetupStatusResponse
  try {
    response = await request<StoryAudioSetupStatusResponse>({
      path: '/api/v1/public/story-audio/status',
      method: 'GET',
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      response = await request<StoryAudioSetupStatusResponse>({
        path: '/api/public/story-audio/status',
        method: 'GET',
      })
    } else {
      throw error
    }
  }

  if (!response?.success || !response.configured || !response.bucket) {
    throw new Error(response?.error || 'Failed to read story-audio setup status')
  }

  return {
    configured: response.configured,
    bucket: response.bucket,
    warnings: response.warnings || [],
  }
}
