import { createSocketTransport } from './whiteboardTransport'
import type { WhiteboardTransport } from './whiteboardTransport'

type TokenGetter = () => string | null

type TransportEntry = {
  boardId: string
  transport: WhiteboardTransport
  refCount: number
  tokenGetter: { current: TokenGetter }
}

const registry = new Map<string, TransportEntry>()

function buildKey(boardId: string) {
  return boardId
}

export function acquireWhiteboardTransport(options: {
  boardId: string
  apiBaseUrl: string
  getToken: TokenGetter
  onError?: (err: unknown) => void
}): WhiteboardTransport {
  const { boardId, apiBaseUrl, getToken, onError } = options
  const key = buildKey(boardId)
  const existing = registry.get(key)

  if (existing) {
    existing.refCount += 1
    existing.tokenGetter.current = getToken
    return createLease(existing)
  }

  const tokenGetter = { current: getToken }
  const transport = createSocketTransport({
    apiBaseUrl,
    getToken: () => tokenGetter.current(),
    onError,
  })

  const entry: TransportEntry = {
    boardId,
    transport,
    refCount: 1,
    tokenGetter,
  }

  registry.set(key, entry)
  return createLease(entry)
}

function createLease(entry: TransportEntry): WhiteboardTransport {
  return {
    connect: async (boardId, token, cursor) => {
      if (boardId !== entry.boardId) {
        console.warn('[WB] Board mismatch for transport lease', { expected: entry.boardId, received: boardId })
      }
      return entry.transport.connect(boardId, token, cursor)
    },
    send: (event) => entry.transport.send(event),
    onEvent: (handler) => entry.transport.onEvent(handler),
    disconnect: () => releaseTransport(entry.boardId),
  }
}

function releaseTransport(boardId: string) {
  const key = buildKey(boardId)
  const entry = registry.get(key)
  if (!entry) return
  entry.refCount -= 1
  if (entry.refCount <= 0) {
    entry.transport.disconnect()
    registry.delete(key)
  }
}
