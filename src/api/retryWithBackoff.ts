/**
 * Retry utility with exponential backoff
 * 
 * Implements retry logic with:
 * - Exponential backoff (delay doubles each retry)
 * - Jitter to prevent thundering herd
 * - Configurable max attempts
 * - Abort signal support
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number
  /** Add random jitter to prevent thundering herd (default: true) */
  useJitter?: boolean
  /** AbortSignal to cancel retry attempts */
  signal?: AbortSignal
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

interface RetryableError {
  status?: number
  code?: string
  message?: string
}

/**
 * Default retry predicate: retry on 500-level errors and timeouts
 */
function defaultShouldRetry(error: unknown, _attempt: number): boolean {
  // Don't retry if we've hit auth errors
  const err = error as RetryableError
  if (err?.status === 401 || err?.status === 403) {
    return false
  }
  
  // Retry on 500-level server errors
  if (err?.status && err.status >= 500 && err.status < 600) {
    return true
  }
  
  // Retry on timeout errors
  if (err?.message && /timeout|timed out/i.test(err.message)) {
    return true
  }
  
  // Retry on network errors
  if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
    return true
  }
  
  return false
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  useJitter: boolean
): number {
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1)
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs)
  
  if (useJitter) {
    // Add ±25% jitter
    const jitterRange = cappedDelay * 0.25
    const jitter = Math.random() * jitterRange * 2 - jitterRange
    return Math.max(0, cappedDelay + jitter)
  }
  
  return cappedDelay
}

/**
 * Sleep for specified duration, respecting abort signal
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'))
      return
    }
    
    const timeout = setTimeout(resolve, ms)
    
    const abortHandler = () => {
      clearTimeout(timeout)
      reject(new Error('Aborted'))
    }
    
    signal?.addEventListener('abort', abortHandler, { once: true })
  })
}

/**
 * Retry a function with exponential backoff
 * 
 * @example
 * ```typescript
 * const data = await retryWithBackoff(
 *   () => fetch('/api/photos'),
 *   { maxAttempts: 3, initialDelayMs: 1000 }
 * )
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    useJitter = true,
    signal,
    shouldRetry = defaultShouldRetry,
  } = options
  
  let lastError: unknown
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check if aborted before attempting
    if (signal?.aborted) {
      throw new Error('Aborted')
    }
    
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      // If this was the last attempt, throw the error
      if (attempt === maxAttempts) {
        throw error
      }
      
      // Check if we should retry this error
      if (!shouldRetry(error, attempt)) {
        throw error
      }
      
      // Calculate delay and wait before retry
      const delay = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier,
        useJitter
      )
      
      console.debug(
        `[retryWithBackoff] Attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms...`,
        { error: (error as Error)?.message }
      )
      
      await sleep(delay, signal)
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError
}
