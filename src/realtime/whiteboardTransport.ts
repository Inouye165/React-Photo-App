import type { WhiteboardStrokeEvent, StrokeEventType } from '../types/whiteboard'

export type WhiteboardEventHandler = (event: WhiteboardStrokeEvent) => void

export type WhiteboardTransport = {
  connect: (boardId: string, token: string) => Promise<void>
  send: (event: WhiteboardStrokeEvent) => void
  onEvent: (handler: WhiteboardEventHandler) => void
  disconnect: () => void
}

type SocketMessage = {
  type: string
  payload?: any
  boardId?: string
  [key: string]: any
}

const STROKE_TYPES: ReadonlySet<StrokeEventType> = new Set(['stroke:start', 'stroke:move', 'stroke:end'])
const KEEP_ALIVE_INTERVAL_MS = 5000 

// [DEBUG] Logging disabled for performance
const debugLog = (label: string, data?: any) => {
  void label
  void data
  // console.log(`[WB-CLIENT] ${label}`, data || '');
}

function asStrokeEvent(message: SocketMessage): WhiteboardStrokeEvent | null {
  if (!STROKE_TYPES.has(message.type as StrokeEventType)) return null

  // 1. Unwrap - Handles both { payload: { x: 1 }} and { x: 1 }
  let data = message.payload || message;
  if (data.payload) data = data.payload;

  // 2. Extract
  const boardId = data.boardId || message.boardId;
  const strokeId = data.strokeId;
  
  // 3. Validation - If missing, we ignore silently to prevent console floods
  if (!boardId || !strokeId) return null;

  // 4. Robust Coords - Default to 0 instead of failing if undefined
  const x = typeof data.x === 'number' ? data.x : 0;
  const y = typeof data.y === 'number' ? data.y : 0;
  const t = typeof data.t === 'number' ? data.t : Date.now();

  return {
    type: message.type as StrokeEventType,
    boardId,
    strokeId,
    x,
    y,
    t,
    color: data.color,
    width: data.width,
    sourceId: data.sourceId,
  }
}

function toWebSocketUrl(apiBaseUrl: string, token: string): string {
  const base = apiBaseUrl.replace(/\/$/, '')
  const url = new URL(base)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = new URL(`${protocol}//${url.host}/events/whiteboard`)
  const tokenValue = token.trim()
  if (!tokenValue) throw new Error('token is required')
  wsUrl.searchParams.set('token', tokenValue)
  return wsUrl.toString()
}

export function createSocketTransport({
  apiBaseUrl,
  onError,
  signal,
}: {
  apiBaseUrl: string
  onError?: (err: unknown) => void
  signal?: AbortSignal
}): WhiteboardTransport {
  let ws: WebSocket | null = null
  let activeBoardId: string | null = null
  let keepAliveTimer: any = null
  const handlers = new Set<WhiteboardEventHandler>()
  let connectPromise: Promise<void> | null = null
  let connectKey: string | null = null

  const cleanupAbort = (abortHandler: () => void) => {
    if (!signal) return
    try {
      signal.removeEventListener('abort', abortHandler)
    } catch {}
  }

  const handleAbort = () => {
    try { ws?.close() } catch {}
  }

  const registerAbort = () => {
    if (!signal) return
    if (signal.aborted) { handleAbort(); return }
    signal.addEventListener('abort', handleAbort, { once: true })
  }

  const stopKeepAlive = () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer)
      keepAliveTimer = null
    }
  }

  const startKeepAlive = (boardId: string) => {
    stopKeepAlive()
    keepAliveTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping', payload: { boardId } }))
        } catch {}
      }
    }, KEEP_ALIVE_INTERVAL_MS)
  }

  return {
    connect: async (boardId: string, token: string) => {
      const nextKey = `${boardId}::${token || ''}`
      if (connectPromise && connectKey === nextKey) {
        return connectPromise
      }
      if (ws && ws.readyState === WebSocket.OPEN && activeBoardId === boardId) {
        return
      }

      connectKey = nextKey
      const url = toWebSocketUrl(apiBaseUrl, token)
      debugLog('Connecting', { boardId, url })
      ws = new WebSocket(url)
      activeBoardId = boardId

      let opened = false
      let resolveReady: (() => void) | null = null
      let rejectReady: ((err: unknown) => void) | null = null
      const ready = new Promise<void>((resolve, reject) => {
        resolveReady = resolve
        rejectReady = reject
      })

      registerAbort()

      ws.addEventListener('open', () => {
        console.log('[WB] Connected') 
        opened = true
        try {
          ws?.send(JSON.stringify({ type: 'whiteboard:join', payload: { boardId } }))
          startKeepAlive(boardId)
        } catch {}
        resolveReady?.()
      })

      ws.addEventListener('message', async (evt) => {
        try {
          const data = typeof evt.data === 'string' ? evt.data : await evt.data.text()
          const parsed = JSON.parse(data) as SocketMessage

          // Only log explicit server errors (low frequency)
          if (parsed.type === 'whiteboard:error') {
            console.error('[WB] Server Error:', parsed.payload)
          }

          const event = asStrokeEvent(parsed)
          if (event) {
            handlers.forEach((handler) => handler(event))
          }
        } catch (err) {
          // ignore parse errors to keep stream smooth
        }
      })

      ws.addEventListener('error', (err) => {
        console.error('[WB] Socket error', err)
        stopKeepAlive()
        rejectReady?.(err)
        onError?.(err)
      })

      ws.addEventListener('close', () => {
        console.log('[WB] Disconnected')
        stopKeepAlive()
        cleanupAbort(handleAbort)
        connectPromise = null
        connectKey = null
        if (!opened) rejectReady?.(new Error('WebSocket closed before open'))
      })

      connectPromise = ready
      try { await ready } catch (err) { cleanupAbort(handleAbort); throw err }
      finally { connectPromise = null }
    },
    send: (event: WhiteboardStrokeEvent) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const payload = { ...event, boardId: event.boardId }
      try {
        ws.send(JSON.stringify({ type: event.type, payload }))
      } catch {}
    },
    onEvent: (handler: WhiteboardEventHandler) => {
      handlers.add(handler)
    },
    disconnect: () => {
      stopKeepAlive()
      handlers.clear()
      const boardId = activeBoardId
      activeBoardId = null
      connectPromise = null
      connectKey = null
      if (ws && boardId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'whiteboard:leave', payload: { boardId } }))
        } catch {}
      }
      try { ws?.close() } catch {}
      ws = null
      cleanupAbort(handleAbort)
    },
  }
}