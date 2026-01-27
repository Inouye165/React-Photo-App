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
}

const STROKE_TYPES: ReadonlySet<StrokeEventType> = new Set(['stroke:start', 'stroke:move', 'stroke:end'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function asStrokeEvent(message: SocketMessage): WhiteboardStrokeEvent | null {
  if (!STROKE_TYPES.has(message.type as StrokeEventType)) return null
  if (!isRecord(message.payload)) return null

  const boardId = message.payload.boardId
  const strokeId = message.payload.strokeId
  const x = message.payload.x
  const y = message.payload.y
  const t = message.payload.t

  if (typeof boardId !== 'string' || boardId.trim().length === 0) return null
  if (typeof strokeId !== 'string' || strokeId.trim().length === 0) return null
  if (typeof x !== 'number' || typeof y !== 'number' || typeof t !== 'number') return null

  const color = typeof message.payload.color === 'string' ? message.payload.color : undefined
  const width = typeof message.payload.width === 'number' ? message.payload.width : undefined
  const sourceId = typeof message.payload.sourceId === 'string' ? message.payload.sourceId : undefined

  return {
    type: message.type as StrokeEventType,
    boardId,
    strokeId,
    x,
    y,
    t,
    color,
    width,
    sourceId,
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

  return {
    connect: async (boardId: string, token: string) => {
      if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
        throw new Error('apiBaseUrl is required')
      }
      if (!boardId || typeof boardId !== 'string') {
        throw new Error('boardId is required')
      }
      if (!token || typeof token !== 'string') {
        throw new Error('token is required')
      }

      const url = toWebSocketUrl(apiBaseUrl, token)
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
        opened = true
        try {
          ws?.send(JSON.stringify({ type: 'whiteboard:join', payload: { boardId } }))
        } catch {
          // ignore
        }
        resolveReady?.()
      })

      ws.addEventListener('message', async (evt) => {
        try {
          const data = evt?.data
          if (typeof data === 'string') {
            const parsed = JSON.parse(data) as SocketMessage
            const event = asStrokeEvent(parsed)
            if (event) handlers.forEach((handler) => handler(event))
            return
          }

          if (data instanceof Blob) {
            const text = await data.text()
            const parsed = JSON.parse(text) as SocketMessage
            const event = asStrokeEvent(parsed)
            if (event) handlers.forEach((handler) => handler(event))
          }
        } catch (err) {
          onError?.(err)
        }
      })

      ws.addEventListener('error', (err) => {
        rejectReady?.(err)
        onError?.(err)
      })

      ws.addEventListener('close', () => {
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
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const payload = {
        ...event,
        boardId: event.boardId,
      }
      try {
        ws.send(JSON.stringify({ type: event.type, payload }))
      } catch {
        // ignore
      }
    },
    onEvent: (handler: WhiteboardEventHandler) => {
      handlers.add(handler)
    },
    disconnect: () => {
      handlers.clear()
      const boardId = activeBoardId
      activeBoardId = null
      if (ws && boardId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'whiteboard:leave', payload: { boardId } }))
        } catch {
          // ignore
        }
      }
      try {
        ws?.close()
      } catch {
        // ignore
      }
      ws = null
      cleanupAbort(handleAbort)
    },
  }
}
