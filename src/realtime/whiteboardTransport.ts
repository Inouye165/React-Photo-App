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
  payload?: unknown
  eventId?: string
  // Allow flat properties for legacy/broadcast compatibility
  boardId?: string
  [key: string]: any
}

const STROKE_TYPES: ReadonlySet<StrokeEventType> = new Set(['stroke:start', 'stroke:move', 'stroke:end'])
const KEEP_ALIVE_INTERVAL_MS = 5000 

// [DEBUG] Logging Helper
const debugLog = (label: string, data?: any) => {
  const timestamp = new Date().toISOString().split('T')[1]; // HH:mm:ss.sss
  console.log(`%c[WB-CLIENT ${timestamp}] ${label}`, 'color: #00bcd4; font-weight: bold;', data || '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function asStrokeEvent(message: SocketMessage): WhiteboardStrokeEvent | null {
  if (!STROKE_TYPES.has(message.type as StrokeEventType)) return null

  // --- ROBUST PAYLOAD EXTRACTION ---
  let data: any = message.payload;

  // Case 1: Double-wrapped (e.g. { payload: { payload: { ... } } })
  if (isRecord(data) && isRecord(data.payload)) {
    data = data.payload;
  }
  // Case 2: Flat message (e.g. { type: '...', boardId: '...' })
  else if (!data && 'boardId' in message) {
    data = message;
  }
  
  if (!isRecord(data)) {
    console.warn('[WB-CLIENT] ❌ Ignored: Payload is not a record', message);
    return null;
  }

  const { boardId, strokeId, x, y, t, color, width, sourceId } = data as any;

  // --- DETAILED VALIDATION LOGGING ---
  if (typeof boardId !== 'string' || boardId.trim().length === 0) {
    console.warn('[WB-CLIENT] ❌ Ignored: Missing/Invalid boardId', data);
    return null;
  }
  if (typeof strokeId !== 'string' || strokeId.trim().length === 0) {
    console.warn('[WB-CLIENT] ❌ Ignored: Missing/Invalid strokeId', data);
    return null;
  }
  if (typeof x !== 'number' || typeof y !== 'number' || typeof t !== 'number') {
    console.warn('[WB-CLIENT] ❌ Ignored: Invalid coordinates/time', { x, y, t });
    return null;
  }

  return {
    type: message.type as StrokeEventType,
    boardId,
    strokeId,
    x,
    y,
    t,
    color: typeof color === 'string' ? color : undefined,
    width: typeof width === 'number' ? width : undefined,
    sourceId: typeof sourceId === 'string' ? sourceId : undefined,
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

  const cleanupAbort = (abortHandler: () => void) => {
    if (!signal) return
    try {
      signal.removeEventListener('abort', abortHandler)
    } catch {
      // ignore
    }
  }

  const handleAbort = () => {
    debugLog('Aborting connection')
    try {
      ws?.close()
    } catch {
      // ignore
    }
  }

  const registerAbort = () => {
    if (!signal) return
    if (signal.aborted) {
      handleAbort()
      return
    }
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
        const pingPayload = { type: 'ping', payload: { boardId } }
        try {
          ws.send(JSON.stringify(pingPayload))
        } catch (err) {
          debugLog('KeepAlive Send Failed', err)
        }
      }
    }, KEEP_ALIVE_INTERVAL_MS)
  }

  return {
    connect: async (boardId: string, token: string) => {
      if (!apiBaseUrl || typeof apiBaseUrl !== 'string') throw new Error('apiBaseUrl is required')
      if (!boardId || typeof boardId !== 'string') throw new Error('boardId is required')
      if (!token || typeof token !== 'string') throw new Error('token is required')

      const url = toWebSocketUrl(apiBaseUrl, token)
      debugLog('Connecting...', { boardId, url })
      
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
        debugLog('Socket OPEN')
        opened = true
        try {
          // Send JOIN
          const joinMsg = { type: 'whiteboard:join', payload: { boardId } }
          debugLog('Sending JOIN', joinMsg)
          ws?.send(JSON.stringify(joinMsg))
          startKeepAlive(boardId)
        } catch (err) {
          debugLog('Error sending JOIN', err)
        }
        resolveReady?.()
      })

      ws.addEventListener('message', async (evt) => {
        try {
          const data = evt?.data
          let parsed: SocketMessage | null = null

          if (typeof data === 'string') {
            parsed = JSON.parse(data) as SocketMessage
          } else if (data instanceof Blob) {
            const text = await data.text()
            parsed = JSON.parse(text) as SocketMessage
          }

          if (parsed) {
            // debugLog('Received Message', { type: parsed.type }) // Reduced noise

            if (parsed.type === 'whiteboard:error') {
                console.error('[WB-CLIENT] ❌ SERVER ERROR:', parsed.payload)
            }

            const event = asStrokeEvent(parsed)
            if (event) {
                handlers.forEach((handler) => handler(event))
            } else if (!['ping', 'whiteboard:joined'].includes(parsed.type)) {
                // If it's a stroke but wasn't parsed, we warned inside asStrokeEvent
                // debugLog('Message Ignored (No Handler/Not Stroke)', parsed.type) 
            }
          }
        } catch (err) {
          debugLog('Message Processing Failed', err)
          onError?.(err)
        }
      })

      ws.addEventListener('error', (err) => {
        console.error('[WB-CLIENT] ❌ Socket Error Event:', err)
        stopKeepAlive()
        rejectReady?.(err)
        onError?.(err)
      })

      ws.addEventListener('close', (evt) => {
        debugLog('Socket CLOSED', { code: evt.code, reason: evt.reason, wasClean: evt.wasClean })
        stopKeepAlive()
        cleanupAbort(handleAbort)
        if (!opened) {
          rejectReady?.(new Error('WebSocket closed before open'))
        }
      })

      try {
        await ready
      } catch (err) {
        cleanupAbort(handleAbort)
        throw err
      }
    },
    send: (event: WhiteboardStrokeEvent) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        debugLog('Cannot send: Socket not open')
        return
      }
      // Send as standard payload structure
      const payload = {
        ...event,
        boardId: event.boardId,
      }
      try {
        ws.send(JSON.stringify({ type: event.type, payload }))
      } catch (err) {
        debugLog('Send Failed', err)
      }
    },
    onEvent: (handler: WhiteboardEventHandler) => {
      handlers.add(handler)
    },
    disconnect: () => {
      debugLog('Disconnecting manually')
      stopKeepAlive()
      handlers.clear()
      const boardId = activeBoardId
      activeBoardId = null
      if (ws && boardId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'whiteboard:leave', payload: { boardId } }))
        } catch { /* ignore */ }
      }
      try { ws?.close() } catch { /* ignore */ }
      ws = null
      cleanupAbort(handleAbort)
    },
  }
}