type TutorAssistViewState = 'ready' | 'loading' | 'simple' | 'deep'

const TUTOR_ASSIST_STORAGE_KEY = 'photo-app:right-panel:tutor-assist:v2'

type TutorAssistStoredState = {
  contextKey: string
  viewState: TutorAssistViewState
  notes: string
}

let tutorAssistSessionCache: TutorAssistStoredState | null = null

function normalizeStoredState(raw: unknown): TutorAssistStoredState | null {
  if (!raw || typeof raw !== 'object') return null

  const parsed = raw as { contextKey?: string; viewState?: TutorAssistViewState; notes?: string }
  if (typeof parsed.contextKey !== 'string' || !parsed.contextKey.trim()) {
    return null
  }

  return {
    contextKey: parsed.contextKey,
    viewState: parsed.viewState === 'ready' || parsed.viewState === 'loading' || parsed.viewState === 'simple' || parsed.viewState === 'deep'
      ? parsed.viewState
      : 'ready',
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
  }
}

export function readStoredTutorAssistState(contextKey?: string | null): { viewState: TutorAssistViewState; notes: string } | null {
  const normalizedContextKey = typeof contextKey === 'string' ? contextKey.trim() : ''
  if (!normalizedContextKey) return null

  const readSessionFallback = () => (
    tutorAssistSessionCache?.contextKey === normalizedContextKey
      ? { viewState: tutorAssistSessionCache.viewState, notes: tutorAssistSessionCache.notes }
      : null
  )

  if (typeof window === 'undefined') {
    return readSessionFallback()
  }

  try {
    const raw = window.localStorage.getItem(TUTOR_ASSIST_STORAGE_KEY)
    if (!raw) return readSessionFallback()

    tutorAssistSessionCache = normalizeStoredState(JSON.parse(raw))
    return readSessionFallback()
  } catch {
    return readSessionFallback()
  }
}

export function writeStoredTutorAssistState(contextKey: string | null | undefined, viewState: TutorAssistViewState, notes: string): void {
  const normalizedContextKey = typeof contextKey === 'string' ? contextKey.trim() : ''
  if (!normalizedContextKey) {
    tutorAssistSessionCache = null
    return
  }

  tutorAssistSessionCache = { contextKey: normalizedContextKey, viewState, notes }
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(TUTOR_ASSIST_STORAGE_KEY, JSON.stringify(tutorAssistSessionCache))
  } catch {
    // Fall back to the in-memory cache when storage is unavailable.
  }
}

export function resetTutorAssistPersistenceForTests(): void {
  tutorAssistSessionCache = null
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(TUTOR_ASSIST_STORAGE_KEY)
  } catch {
    // Ignore storage cleanup failures in test and non-browser environments.
  }
}
