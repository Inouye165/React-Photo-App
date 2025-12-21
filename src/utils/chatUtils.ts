import type { ChatMessage } from '../types/chat'

export function sortMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const at = Date.parse(a.created_at)
    const bt = Date.parse(b.created_at)
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt
    // Tie-breaker: numeric id
    return a.id - b.id
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
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>

  if (typeof r.id !== 'number') return null
  if (typeof r.room_id !== 'string') return null
  if (typeof r.sender_id !== 'string') return null
  if (typeof r.content !== 'string') return null
  if (typeof r.created_at !== 'string') return null

  const rawPhotoId = r.photo_id
  const photo_id = rawPhotoId == null ? null : typeof rawPhotoId === 'number' ? rawPhotoId : null

  return {
    id: r.id,
    room_id: r.room_id,
    sender_id: r.sender_id,
    content: r.content,
    photo_id,
    created_at: r.created_at,
  }
}
