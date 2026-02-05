import crypto from 'crypto'

type WsTokenEntry = {
  boardId: string
  userId: string
  expiresAt: number
}

const WS_TOKEN_TTL_MS = 60_000
const wsTokens = new Map<string, WsTokenEntry>()

function nowMs() {
  return Date.now()
}

function cleanupExpired() {
  const now = nowMs()
  for (const [token, entry] of wsTokens) {
    if (entry.expiresAt <= now) {
      wsTokens.delete(token)
    }
  }
}

export function createWhiteboardWsToken({ boardId, userId }: { boardId: string; userId: string }) {
  cleanupExpired()
  const token = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  wsTokens.set(token, {
    boardId,
    userId,
    expiresAt: nowMs() + WS_TOKEN_TTL_MS,
  })
  return { token, expiresInMs: WS_TOKEN_TTL_MS }
}

export function consumeWhiteboardWsToken(options: { token: string; boardId: string }) {
  cleanupExpired()
  const entry = wsTokens.get(options.token)
  if (!entry) return { ok: false as const }
  if (entry.boardId !== options.boardId) {
    wsTokens.delete(options.token)
    return { ok: false as const }
  }
  if (entry.expiresAt <= nowMs()) {
    wsTokens.delete(options.token)
    return { ok: false as const }
  }
  wsTokens.delete(options.token)
  return { ok: true as const, userId: entry.userId }
}
