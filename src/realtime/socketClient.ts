export type SocketMessage = {
  type: string
  payload?: unknown
  eventId?: string
}

export type ClientMessage = {
  type: string
  roomId?: string
}

export type SocketClient = {
  send: (message: ClientMessage) => void
  close: () => void
  closed: Promise<void>
}

export type ConnectPhotoSocketParams = {
  apiBaseUrl: string
  token: string
  onMessage: (message: SocketMessage) => void
  onError?: (err: unknown) => void
  signal?: AbortSignal
  since?: string | number
}

function toWebSocketUrl(apiBaseUrl: string, token: string, since?: string | number): string {
  const base = apiBaseUrl.replace(/\/$/, '')
  const url = new URL(base)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = new URL(`${protocol}//${url.host}/events/photos`)

  const tokenValue = token.trim()
  if (!tokenValue) throw new Error('token is required')
  wsUrl.searchParams.set('token', tokenValue)

  const sinceValue = since === undefined || since === null ? '' : String(since).trim()
  if (sinceValue) {
    wsUrl.searchParams.set('since', sinceValue)
  }

  return wsUrl.toString()
}

export async function connectPhotoSocket(params: ConnectPhotoSocketParams): Promise<SocketClient> {
  const { apiBaseUrl, token, onMessage, onError, signal, since } = params

  if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
    throw new Error('apiBaseUrl is required')
  }
  if (!token || typeof token !== 'string') {
    throw new Error('token is required')
  }

  const url = toWebSocketUrl(apiBaseUrl, token, since)
  const ws = new WebSocket(url)

  let resolveClosed: (() => void) | null = null
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve
  })

  let resolveReady: (() => void) | null = null
  let rejectReady: ((e: unknown) => void) | null = null
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  const cleanupAbort = () => {
    if (!signal) return
    try {
      signal.removeEventListener('abort', handleAbort)
    } catch {
      // ignore
    }
  }

  const handleAbort = () => {
    try {
      ws.close()
    } catch {
      // ignore
    }
  }

  if (signal) {
    if (signal.aborted) {
      handleAbort()
    } else {
      signal.addEventListener('abort', handleAbort, { once: true })
    }
  }

  let opened = false

  ws.addEventListener('open', () => {
    opened = true
    resolveReady?.()
  })

  ws.addEventListener('message', async (evt) => {
    try {
      const data = evt?.data
      if (typeof data === 'string') {
        const parsed = JSON.parse(data)
        if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
          onMessage(parsed as SocketMessage)
        }
        return
      }

      if (data instanceof Blob) {
        const text = await data.text()
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
          onMessage(parsed as SocketMessage)
        }
      }
    } catch (err) {
      onError?.(err)
    }
  })

  ws.addEventListener('error', (err) => {
    if (!opened) {
      rejectReady?.(err)
    }
    onError?.(err)
  })

  ws.addEventListener('close', () => {
    cleanupAbort()
    if (!opened) {
      rejectReady?.(new Error('WebSocket closed before open'))
    }
    resolveClosed?.()
  })

  try {
    await ready
  } catch (err) {
    cleanupAbort()
    throw err
  }

  return {
    send: (message: ClientMessage) => {
      try {
        ws.send(JSON.stringify(message))
      } catch {
        // ignore
      }
    },
    close: () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    },
    closed,
  }
}
