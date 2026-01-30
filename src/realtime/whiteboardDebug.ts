type DebugFlagValue = string | null | undefined

const WHITEBOARD_DEBUG_QUERY_KEYS = ['wbDebug', 'whiteboardDebug']
const WHITEBOARD_DEBUG_STORAGE_KEY = 'wb:debug'

let cachedEnabled: boolean | null = null

function isTruthy(value: DebugFlagValue): boolean {
  if (!value) return false
  const normalized = String(value).trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function isWhiteboardDebugEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled

  if (typeof globalThis === 'undefined') {
    cachedEnabled = false
    return cachedEnabled
  }

  let queryEnabled = false
  try {
    const location = (globalThis as typeof globalThis & { location?: Location }).location
    if (location?.search) {
      const params = new URLSearchParams(location.search)
      queryEnabled = WHITEBOARD_DEBUG_QUERY_KEYS.some((key) => isTruthy(params.get(key)))
    }
  } catch {
    // ignore
  }

  let storageEnabled = false
  try {
    const storage = (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
    storageEnabled = isTruthy(storage?.getItem(WHITEBOARD_DEBUG_STORAGE_KEY))
  } catch {
    // ignore
  }

  cachedEnabled = queryEnabled || storageEnabled
  return cachedEnabled
}

export function whiteboardDebugLog(label: string, data?: Record<string, unknown>): void {
  if (!isWhiteboardDebugEnabled()) return
  if (data) {
    console.debug('[WB]', label, data)
    return
  }
  console.debug('[WB]', label)
}
