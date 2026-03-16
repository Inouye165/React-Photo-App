import type { WhiteboardTutorMessage, WhiteboardTutorResponse } from '../types/whiteboard'

const TUTOR_ANALYSIS_CACHE_PREFIX = 'whiteboard:tutor-analysis:v2:'
const SHOULD_LOG_TUTOR_FIX_DEBUG = typeof window !== 'undefined' && import.meta.env.DEV

type TutorAnalysisCacheKeyOptions = {
  boardId?: string | null
  inputMode: 'photo' | 'text'
  mode?: 'analysis' | 'tutor' | 'chat'
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

function tutorFixDebug(label: string, details: Record<string, unknown>): void {
  if (!SHOULD_LOG_TUTOR_FIX_DEBUG) return
  console.info('[TUTOR-FIX-DEBUG]', label, details)
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
    version: 'v2',
    mode: options.mode ?? 'analysis',
    inputMode: options.inputMode,
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
      tutorFixDebug('cache miss for analysis key', { cacheKey })
      return null
    }

    const parsed = JSON.parse(raw) as Partial<StoredTutorAnalysisCacheEntry> | null
    if (!parsed || typeof parsed !== 'object' || !parsed.response || typeof parsed.response !== 'object') {
      tutorFixDebug('cache invalid payload for analysis key', { cacheKey })
      return null
    }

    const response = parsed.response as WhiteboardTutorResponse
    if (!hasRenderableStructuredAnalysis(response)) {
      window.localStorage.removeItem(cacheKey)
      console.warn('[WB-TUTOR] cache:discarded-invalid-entry', { cacheKey })
      tutorFixDebug('cache discarded invalid structured analysis', { cacheKey })
      return null
    }

    tutorFixDebug('cache hit for analysis key', {
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
    tutorFixDebug('cache write for analysis key', {
      cacheKey,
      savedAt: payload.savedAt,
      problemText: response.analysisResult?.problemText ?? response.problem ?? '',
      stepCount: response.analysisResult?.steps?.length ?? response.steps?.length ?? 0,
    })
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

export function readLatestTutorAnalysisDeviceCache(options?: { boardId?: string | null }): WhiteboardTutorResponse | null {
  if (typeof window === 'undefined') return null

  const boardId = options?.boardId?.trim()
  if (!boardId) return null

  const keyPrefix = `${TUTOR_ANALYSIS_CACHE_PREFIX}${boardId}:`
  let latestEntry: { cacheKey: string; savedAt: string; response: WhiteboardTutorResponse } | null = null

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const cacheKey = window.localStorage.key(index)
      if (!cacheKey || !cacheKey.startsWith(keyPrefix)) continue

      const raw = window.localStorage.getItem(cacheKey)
      if (!raw) continue

      const parsed = JSON.parse(raw) as Partial<StoredTutorAnalysisCacheEntry> | null
      if (!parsed || typeof parsed !== 'object' || !parsed.response || typeof parsed.response !== 'object') {
        continue
      }

      const response = parsed.response as WhiteboardTutorResponse
      if (!hasRenderableStructuredAnalysis(response)) {
        window.localStorage.removeItem(cacheKey)
        continue
      }

      const savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString()
      if (!latestEntry || Date.parse(savedAt) > Date.parse(latestEntry.savedAt)) {
        latestEntry = { cacheKey, savedAt, response }
      }
    }
  } catch {
    return null
  }

  if (!latestEntry) {
    tutorFixDebug('cache latest miss for board', { boardId })
    return null
  }

  tutorFixDebug('cache latest hit for board', {
    boardId,
    cacheKey: latestEntry.cacheKey,
    savedAt: latestEntry.savedAt,
    problemText: latestEntry.response.analysisResult?.problemText ?? latestEntry.response.problem ?? '',
    stepCount: latestEntry.response.analysisResult?.steps?.length ?? latestEntry.response.steps?.length ?? 0,
  })

  return {
    ...latestEntry.response,
    cacheSource: 'local-cache',
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

    tutorFixDebug('cache clear for board scope', {
      boardId: boardId || null,
      removedKeys: keysToRemove.length,
    })
  } catch {
    // Ignore storage access failures.
  }
}
