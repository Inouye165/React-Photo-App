import { supabase } from '../supabaseClient'
import type { ChatRoom } from '../types/chat'
import { fetchRooms } from './chat'

export type EnsureWhiteboardMembershipResult = {
  ok: true
} | {
  ok: false
  reason: 'not_member' | 'rls' | 'unknown'
}

function isRlsOrPolicyError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const message = String(error.message || '').toLowerCase()
  return (
    error.code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('policy')
  )
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && error.code === '23505')
}

export async function requireAuthedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message || 'Not authenticated')
  const id = data?.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}

export async function listMyWhiteboards(): Promise<ChatRoom[]> {
  const rooms = await fetchRooms()
  return rooms.filter((r) => (r.type as unknown as string) === 'whiteboard')
}

export async function createWhiteboard(title?: string): Promise<ChatRoom> {
  const userId = await requireAuthedUserId()

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ name: title ?? 'Whiteboard', is_group: true, type: 'whiteboard', created_by: userId, metadata: {} })
    .select('id, name, is_group, created_at, type, metadata')
    .single()

  if (roomError) throw roomError
  if (!room) throw new Error('Failed to create whiteboard')

  console.info('[WB-CLIENT] create-whiteboard:room-created', {
    boardId: (room as ChatRoom).id,
    userId,
  })

  const { error: selfMemberError } = await supabase
    .from('room_members')
    .insert({ room_id: (room as ChatRoom).id, user_id: userId, is_owner: true })

  if (selfMemberError) {
    console.warn('[WB-CLIENT] create-whiteboard:membership-insert-failed', {
      boardId: (room as ChatRoom).id,
      userId,
      code: selfMemberError.code,
      message: selfMemberError.message,
    })
    throw selfMemberError
  }

  console.info('[WB-CLIENT] create-whiteboard:membership-created', {
    boardId: (room as ChatRoom).id,
    userId,
    isOwner: true,
  })

  return room as ChatRoom
}

export async function ensureWhiteboardMembership(boardId: string): Promise<EnsureWhiteboardMembershipResult> {
  let userId = ''
  try {
    userId = await requireAuthedUserId()
  } catch (error) {
    console.warn('[WB-CLIENT] membership-check:auth-failed', {
      boardId,
      message: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, reason: 'unknown' }
  }

  console.info('[WB-CLIENT] membership-check:start', { boardId, userId })

  const { data: existing, error: existingError } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('room_id', boardId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingError) {
    console.warn('[WB-CLIENT] membership-check:query-failed', {
      boardId,
      userId,
      code: existingError.code,
      message: existingError.message,
    })
    return { ok: false, reason: isRlsOrPolicyError(existingError) ? 'rls' : 'unknown' }
  }

  if (existing?.room_id) {
    console.info('[WB-CLIENT] membership-check:exists', { boardId, userId })
    return { ok: true }
  }

  console.info('[WB-CLIENT] membership-insert:attempt', { boardId, userId, isOwner: true })
  const { error: ownerInsertError } = await supabase
    .from('room_members')
    .insert({ room_id: boardId, user_id: userId, is_owner: true })

  if (!ownerInsertError || isUniqueViolation(ownerInsertError)) {
    console.info('[WB-CLIENT] membership-insert:success', { boardId, userId, isOwner: true })
    return { ok: true }
  }

  console.warn('[WB-CLIENT] membership-insert-failed', {
    boardId,
    userId,
    isOwner: true,
    code: ownerInsertError.code,
    message: ownerInsertError.message,
  })

  console.info('[WB-CLIENT] membership-insert:retry', { boardId, userId, isOwner: false })
  const { error: memberInsertError } = await supabase
    .from('room_members')
    .insert({ room_id: boardId, user_id: userId, is_owner: false })

  if (!memberInsertError || isUniqueViolation(memberInsertError)) {
    console.info('[WB-CLIENT] membership-insert:success', { boardId, userId, isOwner: false })
    return { ok: true }
  }

  console.warn('[WB-CLIENT] membership-insert-failed', {
    boardId,
    userId,
    isOwner: false,
    code: memberInsertError.code,
    message: memberInsertError.message,
  })

  if (isRlsOrPolicyError(memberInsertError) || isRlsOrPolicyError(ownerInsertError)) {
    return { ok: false, reason: 'rls' }
  }

  return { ok: false, reason: 'not_member' }
}

export default {}
