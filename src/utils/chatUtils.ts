import type { ChatMessage } from '../types/chat'

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

  if (typeof r.id !== 'string' || !r.id.trim()) {
    logDrop('id is missing or not a UUID string', r)
    return null
  }

  if (typeof r.room_id !== 'string') {
    logDrop('room_id is missing or invalid', r)
    return null
  }
  if (typeof r.sender_id !== 'string') {
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

  const normalizedPhotoId = r.photo_id == null ? null : typeof r.photo_id === 'string' && r.photo_id.trim() ? r.photo_id : null

  return {
    id: r.id,
    room_id: r.room_id,
    sender_id: r.sender_id,
    content: r.content,
    photo_id: normalizedPhotoId,
    created_at: r.created_at,
  }
}
