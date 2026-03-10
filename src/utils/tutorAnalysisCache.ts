import type { WhiteboardTutorResponse } from '../types/whiteboard'

const TUTOR_ANALYSIS_CACHE_PREFIX = 'whiteboard:tutor-analysis:v1:'

type TutorAnalysisCacheKeyOptions = {
  boardId?: string | null
  inputMode: 'photo' | 'text'
  audienceAge?: number
  textContent?: string | null
  imageDataUrl?: string | null
  imageMimeType?: string | null
  imageName?: string | null
}

type StoredTutorAnalysisCacheEntry = {
  savedAt: string
  response: WhiteboardTutorResponse
}

function normalizeText(value?: string | null): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
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
    inputMode: options.inputMode,
    audienceAge: typeof options.audienceAge === 'number' ? options.audienceAge : null,
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
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredTutorAnalysisCacheEntry> | null
    if (!parsed || typeof parsed !== 'object' || !parsed.response || typeof parsed.response !== 'object') {
      return null
    }

    return parsed.response as WhiteboardTutorResponse
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
  } catch {
    // Ignore storage quota and serialization failures.
  }
}
