import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchProtectedBlobUrl, isAbortError, revokeBlobUrl } from '../api'

interface UseProtectedImageBlobUrlOptions {
  deps?: unknown[]
}

interface UseProtectedImageBlobUrlResult {
  imageBlobUrl: string | null
  fetchError: boolean
  isLoading: boolean
  retry: () => void
}

type FetchRanState = {
  lastUrl?: string
  [key: string]: boolean | string | undefined
}

/**
 * useProtectedImageBlobUrl
 *
 * Fetches a protected image URL and returns a revocable object URL (blob:...)
 * for rendering.
 *
 * This hook intentionally preserves the runtime behavior that previously lived
 * in `EditPage.jsx`, including:
 * - AbortController cancellation on URL change/unmount
 * - Ignoring AbortError (no noisy logs/state)
 * - A dev/StrictMode-style double-fetch guard keyed by `displayUrl::retryN`
 * - Ensuring object URLs are revoked to prevent memory leaks
 * - Retry behavior that re-fetches after failures
 *
 * Security: this hook does not log URLs, tokens, or session details.
 */
export function useProtectedImageBlobUrl(
  displayUrl: string | null | undefined,
  options: UseProtectedImageBlobUrlOptions = {}
): UseProtectedImageBlobUrlResult {
  const deps = Array.isArray(options?.deps) ? options.deps : []

  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Dev double-fetch guard: only fetch once per image key
  const fetchRanRef = useRef<FetchRanState>({})
  const abortControllerRef = useRef<AbortController | null>(null)

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1)
  }, [])

  useEffect(() => {
    if (!displayUrl) return undefined

    let mounted = true
    let currentObjectUrl: string | null = null

    // Match previous behavior: clear error at the start of a (re)fetch cycle.
    setFetchError(false)

    // Abort previous fetch if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new window.AbortController()
    abortControllerRef.current = controller

    const key = displayUrl + `::retry${retryCount}`

    // Preserve prior guard semantics exactly.
    if (fetchRanRef.current.lastUrl !== key) {
      fetchRanRef.current = { lastUrl: key }
    }
    const fetchRan = fetchRanRef.current

    if (fetchRan[key]) {
      // Optional debug logging is controlled by env var.
      if (import.meta.env.VITE_DEBUG_IMAGES === 'true') {
        console.log('[DEBUG_IMAGES] Skipping duplicate fetch for', key)
      }
      return
    }

    fetchRan[key] = true

    if (import.meta.env.VITE_DEBUG_IMAGES === 'true') {
      console.log('[DEBUG_IMAGES] Fetching image for', key)
    }

    ;(async () => {
      try {
        const objUrl = await fetchProtectedBlobUrl(displayUrl, { signal: controller.signal })
        if (!mounted || controller.signal.aborted) {
          if (objUrl) revokeBlobUrl(objUrl)
          return
        }

        // Preserve previous behavior: a falsy/empty response counts as a failure.
        if (!objUrl) {
          setImageBlobUrl(null)
          setFetchError(true)
          fetchRan[key] = false
          return
        }

        currentObjectUrl = objUrl
        setImageBlobUrl(objUrl)
      } catch (error) {
        // React StrictMode or unmounts can legitimately abort requests.
        // We intentionally ignore AbortError to avoid noisy logs.
        if (!mounted || controller.signal.aborted || isAbortError(error)) return
        setFetchError(true)
        fetchRan[key] = false
      }
    })()

    return () => {
      mounted = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (currentObjectUrl) {
        revokeBlobUrl(currentObjectUrl)
      }
      setImageBlobUrl(null)
      fetchRan[key] = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayUrl, retryCount, ...deps])

  // Match the previous UI behavior: the page showed "Loading..." whenever
  // there was a URL to fetch, no blob URL yet, and no non-abort error.
  const isLoading = Boolean(displayUrl) && !imageBlobUrl && !fetchError

  return {
    imageBlobUrl,
    fetchError,
    isLoading,
    retry,
  }
}
