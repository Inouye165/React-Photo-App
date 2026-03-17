export const SHOULD_LOG_TUTOR_ASSIST_DEBUG = import.meta.env.DEV && import.meta.env.VITE_TUTOR_DEBUG === 'true'

export function tutorAssistDebug(label: string, details: Record<string, unknown>): void {
  if (!SHOULD_LOG_TUTOR_ASSIST_DEBUG) return
  console.info('[TUTOR-ASSIST-DEBUG]', label, details)
}