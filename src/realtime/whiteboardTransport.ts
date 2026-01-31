import type { WhiteboardEvent, WhiteboardStrokeEvent, StrokeEventType, WhiteboardClearEvent, WhiteboardHistoryCursor, WhiteboardStrokeAck } from '../types/whiteboard'
import { whiteboardDebugLog } from './whiteboardDebug'

export type WhiteboardEventHandler = (event: WhiteboardEvent) => void
export type WhiteboardAckHandler = (ack: WhiteboardStrokeAck) => void

export type WhiteboardTransport = {
  connect: (boardId: string, token: string, cursor?: WhiteboardHistoryCursor | null) => Promise<void>
  send: (event: WhiteboardEvent) => void
  onEvent: (handler: WhiteboardEventHandler) => () => void
  onAck: (handler: WhiteboardAckHandler) => () => void
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
const PONG_TIMEOUT_MS = 15000
const MAX_BUFFERED_SEND = 2000


function asClearEvent(message: SocketMessage): WhiteboardClearEvent | null {
  if (message.type !== 'whiteboard:clear') return null
  const payload = unwrapPayload(message) || message.payload || message
  const boardId = payload?.boardId || message.boardId
  if (!boardId) return null
  const t = typeof payload?.t === 'number' ? payload.t : Date.now()
  const sourceId = typeof payload?.sourceId === 'string' ? payload.sourceId : undefined
  return { type: 'whiteboard:clear', boardId, t, sourceId }
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

  const x = typeof data.x === 'number' && Number.isFinite(data.x) ? data.x : null
  const y = typeof data.y === 'number' && Number.isFinite(data.y) ? data.y : null
  if (x === null || y === null) return null
  const t = typeof data.t === 'number' && Number.isFinite(data.t) ? data.t : Date.now()
  const seq = typeof data.seq === 'number' && Number.isFinite(data.seq) ? data.seq : undefined
  const segmentIndex = typeof data.segmentIndex === 'number' && Number.isFinite(data.segmentIndex)
    ? data.segmentIndex
    : undefined

  return {
    type: message.type as StrokeEventType,
    boardId,
    strokeId,
    x,
    y,
    t,
    seq,
    segmentIndex,
    color: data.color,
    width: data.width,
    sourceId: data.sourceId,
  }
}

function asAckEvent(message: SocketMessage): WhiteboardStrokeAck | null {
  if (message.type !== 'whiteboard:ack') return null
  const payload = unwrapPayload(message) || message.payload || message
  const boardId = payload?.boardId || message.boardId
  const strokeId = payload?.strokeId
  const segmentIndex = payload?.segmentIndex
  if (!boardId || !strokeId) return null
  if (typeof segmentIndex !== 'number' || !Number.isFinite(segmentIndex)) return null
  const type = typeof payload?.type === 'string' && STROKE_TYPES.has(payload.type as StrokeEventType)
    ? (payload.type as StrokeEventType)
    : undefined
  const seq = typeof payload?.seq === 'number' && Number.isFinite(payload.seq) ? payload.seq : undefined
  return { boardId, strokeId, segmentIndex, type, seq }
}

function unwrapPayload(message: SocketMessage): any {
  const payload = message.payload
  if (payload && typeof payload === 'object' && 'payload' in payload) {
    return (payload as { payload?: any }).payload ?? payload
  }
  return payload
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
  getToken,
  reconnect,
}: {
  apiBaseUrl: string
  onError?: (err: unknown) => void
  signal?: AbortSignal
  getToken?: () => string | null
  reconnect?: {
    enabled?: boolean
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
    jitter?: number
  }
}): WhiteboardTransport {
  let ws: WebSocket | null = null
  let activeBoardId: string | null = null
  let keepAliveTimer: any = null
  const handlers = new Set<WhiteboardEventHandler>()
  const ackHandlers = new Set<WhiteboardAckHandler>()
  let connectPromise: Promise<void> | null = null
  let connectKey: string | null = null
  let lastToken: string | null = null
  let reconnectTimer: any = null
  let reconnectAttempts = 0
  let manualClose = false
  let joined = false
  let pendingEvents: WhiteboardStrokeEvent[] = []
  let lastPongAt = 0
  let lastPongWarnAt = 0
  let joinCursor: WhiteboardHistoryCursor | null = null

  const reconnectConfig = {
    enabled: true,
    maxRetries: 6,
    baseDelayMs: 500,
    maxDelayMs: 8000,
    jitter: 0.2,
    ...(reconnect || {}),
  }

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

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    reconnectAttempts = 0
  }

  const resolveReconnectToken = () => {
    const nextToken = getToken ? getToken() : lastToken
    const trimmed = typeof nextToken === 'string' ? nextToken.trim() : ''
    return trimmed ? trimmed : null
  }

  const scheduleReconnect = () => {
    if (!reconnectConfig.enabled || manualClose) return
    if (reconnectTimer) return
    const boardId = activeBoardId
    if (!boardId) return
    if (reconnectAttempts >= reconnectConfig.maxRetries) return

    const token = resolveReconnectToken()
    if (!token) {
      console.warn('[WB] Reconnect skipped (missing token)', { boardId })
      const delay = Math.min(reconnectConfig.baseDelayMs, reconnectConfig.maxDelayMs)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        scheduleReconnect()
      }, delay)
      return
    }

    const attempt = reconnectAttempts + 1
    reconnectAttempts = attempt
    const expDelay = reconnectConfig.baseDelayMs * Math.pow(2, attempt - 1)
    const cappedDelay = Math.min(expDelay, reconnectConfig.maxDelayMs)
    const jitterRange = cappedDelay * reconnectConfig.jitter
    const delay = Math.max(0, cappedDelay - jitterRange + Math.random() * jitterRange * 2)

    console.warn('[WB] Reconnect scheduled', { boardId, attempt, delay: Math.round(delay) })
    whiteboardDebugLog('socket:reconnect:scheduled', { boardId, attempt, delay: Math.round(delay) })
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect(boardId, token, joinCursor).catch(() => {
        scheduleReconnect()
      })
    }, delay)
  }

  const startKeepAlive = (boardId: string) => {
    stopKeepAlive()
    lastPongAt = Date.now()
    keepAliveTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          const now = Date.now()
          ws.send(JSON.stringify({ type: 'ping', payload: { boardId, t: now } }))
          if (now - lastPongAt > PONG_TIMEOUT_MS) {
            if (now - lastPongWarnAt > PONG_TIMEOUT_MS) {
              lastPongWarnAt = now
              console.warn('[WB] Pong timeout, closing socket', { boardId })
            }
            try { ws.close() } catch {}
          }
        } catch {}
      }
    }, KEEP_ALIVE_INTERVAL_MS)
  }

  const queueEvent = (event: WhiteboardStrokeEvent) => {
    pendingEvents.push(event)
    if (pendingEvents.length > MAX_BUFFERED_SEND) {
      pendingEvents.splice(0, pendingEvents.length - MAX_BUFFERED_SEND)
      console.warn('[WB] Send queue overflow, dropping oldest events', { boardId: event.boardId })
      whiteboardDebugLog('socket:queue:overflow', {
        boardId: event.boardId,
        max: MAX_BUFFERED_SEND,
        pending: pendingEvents.length,
      })
    }
  }

  const flushPending = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !joined) return
    if (!pendingEvents.length) return
    const batch = pendingEvents
    pendingEvents = []
    for (const event of batch) {
      try {
        ws.send(JSON.stringify({ type: event.type, payload: { ...event, boardId: event.boardId } }))
      } catch {
        queueEvent(event)
      }
    }
    console.log('[WB] Flushed queued events', { count: batch.length })
    whiteboardDebugLog('socket:queue:flushed', { count: batch.length })
  }

  const connect = async (boardId: string, token: string, cursor?: WhiteboardHistoryCursor | null) => {
      const nextKey = `${boardId}::${token || ''}`
      if (connectPromise && connectKey === nextKey) {
        return connectPromise
      }
      if (ws && ws.readyState === WebSocket.OPEN && activeBoardId === boardId) {
        return
      }

      connectKey = nextKey
      manualClose = false
      lastToken = token
      joinCursor = cursor ?? null
      const url = toWebSocketUrl(apiBaseUrl, token)
      whiteboardDebugLog('socket:connect', { boardId })
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
        console.log('[WB] Connected', { boardId })
        whiteboardDebugLog('socket:open', { boardId })
        opened = true
        clearReconnect()
        joined = false
        try {
          const joinPayload: Record<string, unknown> = { boardId }
          if (joinCursor) {
            joinPayload.cursor = joinCursor
          }
          ws?.send(JSON.stringify({ type: 'whiteboard:join', payload: joinPayload }))
          whiteboardDebugLog('socket:join:sent', { boardId, hasCursor: Boolean(joinCursor) })
          startKeepAlive(boardId)
        } catch {}
        resolveReady?.()
      })

      ws.addEventListener('message', async (evt) => {
        try {
          const data = typeof evt.data === 'string' ? evt.data : await evt.data.text()
          const parsed = JSON.parse(data) as SocketMessage

          // Only log explicit server errors (low frequency)
          if (parsed.type === 'pong') {
            lastPongAt = Date.now()
            return
          }

          if (parsed.type === 'whiteboard:joined') {
            const joinedBoardId = unwrapPayload(parsed)?.boardId
            if (!joinedBoardId || joinedBoardId === boardId) {
              joined = true
              flushPending()
              whiteboardDebugLog('socket:join:ack', { boardId })
            }
          }

          if (parsed.type === 'whiteboard:error') {
            console.error('[WB] Server Error:', parsed.payload)
          }

          const ack = asAckEvent(parsed)
          if (ack) {
            ackHandlers.forEach((handler) => handler(ack))
            return
          }

          const strokeEvent = asStrokeEvent(parsed)
          if (strokeEvent) {
            handlers.forEach((handler) => handler(strokeEvent))
            return
          }
          const clearEvent = asClearEvent(parsed)
          if (clearEvent) {
            handlers.forEach((handler) => handler(clearEvent))
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

      ws.addEventListener('close', (evt) => {
        console.log(`[WB] Disconnected (Code: ${evt.code}${evt.reason ? `, Reason: ${evt.reason}` : ''})`)
        whiteboardDebugLog('socket:close', { boardId: activeBoardId, code: evt.code, reason: evt.reason })
        console.warn('[WB] Close diagnostics', {
          boardId: activeBoardId,
          readyState: ws?.readyState,
          wasOpen: opened,
          manualClose,
          reconnectAttempts,
          lastTokenPresent: Boolean(lastToken && lastToken.trim()),
        })
        joined = false
        stopKeepAlive()
        cleanupAbort(handleAbort)
        connectPromise = null
        connectKey = null
        if (!opened) rejectReady?.(new Error('WebSocket closed before open'))
        scheduleReconnect()
      })

      connectPromise = ready
      try { await ready } catch (err) { cleanupAbort(handleAbort); throw err }
      finally { connectPromise = null }
    }

  return {
    connect,
    send: (event: WhiteboardEvent) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !joined) {
        if (event.type !== 'whiteboard:clear') {
          queueEvent(event)
          whiteboardDebugLog('socket:queue:buffered', {
            boardId: event.boardId,
            type: event.type,
          })
        }
        return
      }
      const payload = { ...event, boardId: event.boardId }
      try {
        ws.send(JSON.stringify({ type: event.type, payload }))
      } catch {
        if (event.type !== 'whiteboard:clear') {
          queueEvent(event)
          whiteboardDebugLog('socket:queue:send-failed', {
            boardId: event.boardId,
            type: event.type,
          })
        }
      }
    },
    onEvent: (handler: WhiteboardEventHandler) => {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    onAck: (handler: WhiteboardAckHandler) => {
      ackHandlers.add(handler)
      return () => {
        ackHandlers.delete(handler)
      }
    },
    disconnect: () => {
      manualClose = true
      clearReconnect()
      stopKeepAlive()
      handlers.clear()
      ackHandlers.clear()
      pendingEvents = []
      joined = false
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