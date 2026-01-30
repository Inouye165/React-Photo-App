const AUTH_DEBUG_ENABLED =
  import.meta.env.VITE_DEBUG_AUTH === 'true' || import.meta.env.VITE_DEBUG_AUTH === '1'

export function authDebug(message: string, details?: Record<string, unknown>): void {
  if (!AUTH_DEBUG_ENABLED) return
  if (details) {
    console.debug(`[AuthDebug] ${message}`, details)
    return
  }
  console.debug(`[AuthDebug] ${message}`)
}

export function isAuthDebugEnabled(): boolean {
  return AUTH_DEBUG_ENABLED
}
