import type { ChatMessage } from '../types/chat'

function normalizeRequiredString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  return null
}

function normalizeOptionalString(value: unknown): string | null {
  if (value == null) return null
  return normalizeRequiredString(value)
}

export function sortMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const at = Date.parse(a.created_at)
    const bt = Date.parse(b.created_at)
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt
    return a.id.localeCompare(b.id)
  })
}

export function upsertMessage(existing: readonly ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const idx = existing.findIndex((m) => m.id === incoming.id)
  if (idx === -1) return sortMessages([...existing, incoming])

  const next = [...existing]
  next[idx] = incoming
  return sortMessages(next)
}

export function asChatMessage(row: unknown): ChatMessage | null {
  const logDrop = (reason: string, sample?: Record<string, unknown>) => {
    if (!import.meta.env.DEV) return
    try {
      console.warn('[chatUtils] Dropping invalid chat row', {
        reason,
        sample: sample
          ? {
              id: sample.id,
              idType: typeof sample.id,
              room_id: sample.room_id,
              sender_id: sample.sender_id,
              created_at: sample.created_at,
            }
          : null,
      })
    } catch {
      // ignore
    }
  }

  if (!row || typeof row !== 'object') {
    logDrop('row is not an object')
    return null
  }
  const r = row as Record<string, unknown>

  const normalizedId = normalizeRequiredString(r.id)
  if (!normalizedId) {
    logDrop('id is missing or invalid', r)
    return null
  }

  const normalizedRoomId = normalizeRequiredString(r.room_id)
  if (!normalizedRoomId) {
    logDrop('room_id is missing or invalid', r)
    return null
  }

  const normalizedSenderId = normalizeRequiredString(r.sender_id)
  if (!normalizedSenderId) {
    logDrop('sender_id is missing or invalid', r)
    return null
  }

  if (typeof r.content !== 'string') {
    logDrop('content is missing or invalid', r)
    return null
  }
  if (typeof r.created_at !== 'string') {
    logDrop('created_at is missing or invalid', r)
    return null
  }

  const normalizedPhotoId = normalizeOptionalString(r.photo_id)

  return {
    id: normalizedId,
    room_id: normalizedRoomId,
    sender_id: normalizedSenderId,
    content: r.content,
    photo_id: normalizedPhotoId,
    created_at: r.created_at,
  }
}
