import { useCallback, useEffect, useState } from 'react'
import { getAccessToken, getHeadersForGetRequestAsync, onAuthTokenChange } from '../api'

type TokenState = {
  token: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

function parseBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null
  const trimmed = headerValue.trim()
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null
  const token = trimmed.slice(7).trim()
  return token || null
}

export function useRealtimeToken(): { token: string | null; status: TokenState['status']; refresh: () => void } {
  const [state, setState] = useState<TokenState>({ token: getAccessToken(), status: 'idle' })

  const resolveToken = useCallback(async () => {
    const cached = getAccessToken()
    if (cached) {
      setState({ token: cached, status: 'ready' })
      return
    }

    setState((prev) => ({ token: prev.token, status: 'loading' }))

    try {
      const headers = await getHeadersForGetRequestAsync()
      const token = parseBearerToken(headers?.Authorization)
      if (token) {
        setState({ token, status: 'ready' })
      } else {
        setState({ token: null, status: 'error' })
      }
    } catch {
      setState({ token: null, status: 'error' })
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      await resolveToken()
    }

    run().catch(() => {
      if (!cancelled) {
        setState({ token: null, status: 'error' })
      }
    })

    const unsubscribe = onAuthTokenChange((token) => {
      if (cancelled) return
      setState({ token, status: token ? 'ready' : 'error' })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [resolveToken])

  return { token: state.token, status: state.status, refresh: resolveToken }
}
