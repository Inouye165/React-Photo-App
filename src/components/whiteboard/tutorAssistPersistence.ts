type TutorAssistViewState = 'ready' | 'loading' | 'populated'

const TUTOR_ASSIST_STORAGE_KEY = 'photo-app:right-panel:tutor-assist:v1'

let tutorAssistSessionCache: { viewState: TutorAssistViewState; notes: string } | null = null

export function readStoredTutorAssistState(): { viewState: TutorAssistViewState; notes: string } | null {
  if (typeof window === 'undefined') return tutorAssistSessionCache

  try {
    const raw = window.localStorage.getItem(TUTOR_ASSIST_STORAGE_KEY)
    if (!raw) return tutorAssistSessionCache
    const parsed = JSON.parse(raw) as { viewState?: TutorAssistViewState; notes?: string }
    tutorAssistSessionCache = {
      viewState: parsed.viewState === 'ready' || parsed.viewState === 'loading' || parsed.viewState === 'populated'
        ? parsed.viewState
        : 'populated',
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    }
    return tutorAssistSessionCache
  } catch {
    return tutorAssistSessionCache
  }
}

export function writeStoredTutorAssistState(viewState: TutorAssistViewState, notes: string): void {
  tutorAssistSessionCache = { viewState, notes }
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(TUTOR_ASSIST_STORAGE_KEY, JSON.stringify({ viewState, notes }))
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
