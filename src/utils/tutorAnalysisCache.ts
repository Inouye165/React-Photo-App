import type { WhiteboardTutorMessage, WhiteboardTutorModelTier, WhiteboardTutorResponse } from '../types/whiteboard'
import { tutorAssistDebug } from './tutorAssistDebug'

const TUTOR_ANALYSIS_CACHE_PREFIX = 'whiteboard:tutor-analysis:v3:'

type TutorAnalysisCacheKeyOptions = {
  boardId?: string | null
  inputMode: 'photo' | 'text'
  mode?: 'analysis' | 'tutor' | 'chat'
  helpMode?: 'quick' | 'full'
  modelTier?: WhiteboardTutorModelTier
  audienceAge?: number
  messages?: WhiteboardTutorMessage[] | null
  textContent?: string | null
  imageDataUrl?: string | null
  imageMimeType?: string | null
  imageName?: string | null
}

type StoredTutorAnalysisCacheEntry = {
  savedAt: string
  response: WhiteboardTutorResponse
}

function hasRenderableStructuredAnalysis(response: WhiteboardTutorResponse): boolean {
  const analysisResult = response.analysisResult
  if (!analysisResult || typeof analysisResult !== 'object') {
    return false
  }

  const hasProblemText = typeof analysisResult.problemText === 'string' && analysisResult.problemText.trim().length > 0
  const hasSteps = Array.isArray(analysisResult.steps) && analysisResult.steps.length > 0
  const hasSummary = typeof analysisResult.overallSummary === 'string' && analysisResult.overallSummary.trim().length > 0
  const hasAnswers = Array.isArray(analysisResult.finalAnswers) && analysisResult.finalAnswers.some((answer) => typeof answer === 'string' && answer.trim().length > 0)

  return hasProblemText || hasSteps || hasSummary || hasAnswers
}

function normalizeText(value?: string | null): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function normalizeMessages(messages?: WhiteboardTutorMessage[] | null): Array<Pick<WhiteboardTutorMessage, 'role' | 'content'>> {
  return (messages ?? []).map((message) => ({
    role: message.role,
    content: normalizeText(message.content),
  }))
}

function hashString(value: string): string {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildTutorAnalysisDeviceCacheKey(options: TutorAnalysisCacheKeyOptions): string | null {
  const boardId = options.boardId?.trim()
  if (!boardId) return null

  const normalizedPayload = JSON.stringify({
    version: 'v3',
    mode: options.mode ?? 'analysis',
    helpMode: options.helpMode ?? 'quick',
    inputMode: options.inputMode,
    modelTier: options.modelTier ?? 'standard',
    audienceAge: typeof options.audienceAge === 'number' ? options.audienceAge : null,
    messages: normalizeMessages(options.messages),
    textContent: normalizeText(options.textContent),
    imageDataUrl: options.inputMode === 'photo' ? options.imageDataUrl?.trim() || '' : '',
    imageMimeType: options.inputMode === 'photo' ? options.imageMimeType?.trim() || '' : '',
    imageName: options.inputMode === 'photo' ? options.imageName?.trim() || '' : '',
  })

  return `${TUTOR_ANALYSIS_CACHE_PREFIX}${boardId}:${hashString(normalizedPayload)}`
}

export function readTutorAnalysisDeviceCache(cacheKey: string | null | undefined): WhiteboardTutorResponse | null {
  if (!cacheKey || typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) {
      tutorAssistDebug('cache-miss', { cacheKey })
      return null
    }

    const parsed = JSON.parse(raw) as Partial<StoredTutorAnalysisCacheEntry> | null
    if (!parsed || typeof parsed !== 'object' || !parsed.response || typeof parsed.response !== 'object') {
      tutorAssistDebug('cache-invalid-payload', { cacheKey })
      return null
    }

    const response = parsed.response as WhiteboardTutorResponse
    if (!hasRenderableStructuredAnalysis(response)) {
      window.localStorage.removeItem(cacheKey)
      tutorAssistDebug('cache-discarded-invalid-structured-analysis', { cacheKey })
      return null
    }

    tutorAssistDebug('cache-hit', {
      cacheKey,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
      problemText: response.analysisResult?.problemText ?? response.problem ?? '',
      stepCount: response.analysisResult?.steps?.length ?? response.steps?.length ?? 0,
    })

    return {
      ...response,
      cacheSource: 'local-cache',
    }
  } catch {
    return null
  }
}

export function writeTutorAnalysisDeviceCache(cacheKey: string | null | undefined, response: WhiteboardTutorResponse): void {
  if (!cacheKey || typeof window === 'undefined') return

  try {
    const payload: StoredTutorAnalysisCacheEntry = {
      savedAt: new Date().toISOString(),
      response,
    }
    window.localStorage.setItem(cacheKey, JSON.stringify(payload))
    tutorAssistDebug('cache-write', {
      cacheKey,
      savedAt: payload.savedAt,
      problemText: response.analysisResult?.problemText ?? response.problem ?? '',
      stepCount: response.analysisResult?.steps?.length ?? response.steps?.length ?? 0,
    })
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

export function clearTutorAnalysisDeviceCache(options?: { boardId?: string | null }): void {
  if (typeof window === 'undefined') return

  const boardId = options?.boardId?.trim()
  const keyPrefix = boardId ? `${TUTOR_ANALYSIS_CACHE_PREFIX}${boardId}:` : TUTOR_ANALYSIS_CACHE_PREFIX

  try {
    const keysToRemove: string[] = []

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key && key.startsWith(keyPrefix)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key)
    })

    tutorAssistDebug('cache-clear-for-board-scope', {
      boardId: boardId || null,
      removedKeys: keysToRemove.length,
    })
  } catch {
    // Ignore storage access failures.
  }
}
