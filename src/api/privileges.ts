import { request, ApiError, API_BASE_URL, apiLimiter } from './httpClient'
import { getAuthHeaders } from './auth'

export async function checkPrivilege(relPath: string, serverUrl = `${API_BASE_URL}/privilege`): Promise<unknown> {
  const maxAttempts = 3
  const delayMs = 250
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await request({
        path: serverUrl,
        method: 'POST',
        headers: getAuthHeaders(),
        body: { relPath },
        limiter: apiLimiter,
      })
    } catch (err: unknown) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return undefined
      
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs * attempt))
        continue
      }
      throw err
    }
  }
}

type PrivBatchCache = Map<string, { ts: number; promise: Promise<Record<string, unknown>> }>

export async function checkPrivilegesBatch(
  filenames: string[],
  serverUrl = `${API_BASE_URL}/privilege`,
): Promise<Record<string, unknown>> {
  let safe = filenames
  if (!Array.isArray(safe)) safe = []

  const root = globalThis as typeof globalThis & { __privBatchCache?: PrivBatchCache }
  if (!root.__privBatchCache) root.__privBatchCache = new Map()

  const key = safe.slice().sort().join('|')
  const TTL = 1200
  const now = Date.now()
  const existing = root.__privBatchCache.get(key)
  if (existing && now - existing.ts < TTL) return existing.promise

  const CHUNK_SIZE = 12
  const maxAttempts = 4
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const results: Record<string, unknown> = {}

  async function postChunk(chunk: string[], attempt = 1): Promise<Record<string, unknown> | null> {
    try {
      const json = await request<{ success?: boolean; error?: string; privileges?: Record<string, unknown> }>({
        path: serverUrl,
        method: 'POST',
        headers: getAuthHeaders(),
        body: { filenames: chunk },
        limiter: apiLimiter,
      })
      
      if (!json.success) throw new Error('Batch privilege check error: ' + (json.error || 'unknown'))
      return json.privileges || {}
    } catch (e: unknown) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null
      if (e instanceof ApiError && e.status === 429) {
         if (attempt < maxAttempts) {
          await sleep(250 * Math.pow(2, attempt - 1))
          return postChunk(chunk, attempt + 1)
        }
        throw new Error('Batch privilege check rate limited: 429')
      }

      if (attempt < maxAttempts) {
        await sleep(250 * Math.pow(2, attempt - 1))
        return postChunk(chunk, attempt + 1)
      }
      throw e
    }
  }

  const promise = (async () => {
    for (let i = 0; i < safe.length; i += CHUNK_SIZE) {
      const chunk = safe.slice(i, i + CHUNK_SIZE)
      const chunkRes = await postChunk(chunk, 1)
      if (chunkRes && typeof chunkRes === 'object') Object.assign(results, chunkRes)
    }
    return results
  })()

  root.__privBatchCache.set(key, { ts: Date.now(), promise })
  try {
    const res = await promise
    return res
  } catch (e: unknown) {
    const msg = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : String(e)
    throw new Error('Error checking privileges batch: ' + msg)
  }
}
