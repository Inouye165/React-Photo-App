const readEnvString = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  return String(value)
}

export const FRONTEND_VERSION =
  readEnvString(import.meta.env.VITE_APP_VERSION) ||
  readEnvString(import.meta.env.VITE_BUILD_ID) ||
  'dev'

export const FRONTEND_BUILD_TIMESTAMP =
  readEnvString(import.meta.env.VITE_BUILD_TIMESTAMP) ||
  new Date().toISOString()
