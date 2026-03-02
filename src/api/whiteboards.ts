import { supabase } from '../supabaseClient'
import type { ChatRoom } from '../types/chat'
import { fetchRooms } from './chat'
import { ApiError, request } from './httpClient'

const whiteboardMembershipLogOnce = new Set<string>()

function wbMembershipLogOnce(level: 'info' | 'warn', key: string, message: string, details: Record<string, unknown>) {
  if (whiteboardMembershipLogOnce.has(key)) return
  whiteboardMembershipLogOnce.add(key)
  if (level === 'warn') {
    console.warn(message, details)
    return
  }
  console.info(message, details)
}

export type EnsureWhiteboardMembershipResult = {
  ok: true
} | {
  ok: false
  reason: 'not_member' | 'rls' | 'unknown'
}

export type CreateWhiteboardInviteResult = {
  joinUrl: string
  expiresAt: string
}

export type JoinWhiteboardByTokenResult = {
  roomId: string
}

const whiteboardJoinLogOnce = new Set<string>()

function wbJoinLogOnce(key: string, details: Record<string, unknown>) {
  if (whiteboardJoinLogOnce.has(key)) return
  whiteboardJoinLogOnce.add(key)
  console.warn('[WB-JOIN] join-failed', details)
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

  wbMembershipLogOnce('info', `membership-check:start:${boardId}:${userId}`, '[WB-CLIENT] membership-check:start', { boardId, userId })

  const { data: existing, error: existingError } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('room_id', boardId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingError) {
    wbMembershipLogOnce('warn', `membership-check:query-failed:${boardId}:${userId}:${existingError.code ?? 'unknown'}`, '[WB-CLIENT] membership-check:query-failed', {
      boardId,
      userId,
      code: existingError.code,
      message: existingError.message,
    })
    return { ok: false, reason: isRlsOrPolicyError(existingError) ? 'rls' : 'unknown' }
  }

  if (existing?.room_id) {
    wbMembershipLogOnce('info', `membership-check:exists:${boardId}:${userId}`, '[WB-CLIENT] membership-check:exists', { boardId, userId })
    return { ok: true }
  }

  wbMembershipLogOnce('info', `membership-insert:attempt:${boardId}:${userId}:owner`, '[WB-CLIENT] membership-insert:attempt', { boardId, userId, isOwner: true })
  const { error: ownerInsertError } = await supabase
    .from('room_members')
    .insert({ room_id: boardId, user_id: userId, is_owner: true })

  if (!ownerInsertError || isUniqueViolation(ownerInsertError)) {
    wbMembershipLogOnce('info', `membership-insert:success:${boardId}:${userId}:owner`, '[WB-CLIENT] membership-insert:success', { boardId, userId, isOwner: true })
    return { ok: true }
  }

  wbMembershipLogOnce('warn', `membership-insert-failed:${boardId}:${userId}:owner:${ownerInsertError.code ?? 'unknown'}`, '[WB-CLIENT] membership-insert-failed', {
    boardId,
    userId,
    isOwner: true,
    code: ownerInsertError.code,
    message: ownerInsertError.message,
  })

  wbMembershipLogOnce('info', `membership-insert:retry:${boardId}:${userId}:member`, '[WB-CLIENT] membership-insert:retry', { boardId, userId, isOwner: false })
  const { error: memberInsertError } = await supabase
    .from('room_members')
    .insert({ room_id: boardId, user_id: userId, is_owner: false })

  if (!memberInsertError || isUniqueViolation(memberInsertError)) {
    wbMembershipLogOnce('info', `membership-insert:success:${boardId}:${userId}:member`, '[WB-CLIENT] membership-insert:success', { boardId, userId, isOwner: false })
    return { ok: true }
  }

  wbMembershipLogOnce('warn', `membership-insert-failed:${boardId}:${userId}:member:${memberInsertError.code ?? 'unknown'}`, '[WB-CLIENT] membership-insert-failed', {
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

export async function createWhiteboardInvite(boardId: string): Promise<CreateWhiteboardInviteResult> {
  if (!boardId) throw new Error('Missing board id')

  return request<CreateWhiteboardInviteResult>({
    path: `/api/whiteboards/${boardId}/invites`,
    method: 'POST',
  })
}

export async function joinWhiteboardByToken(token: string): Promise<JoinWhiteboardByTokenResult> {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new Error('Join token is required')
  }

  try {
    return await request<JoinWhiteboardByTokenResult>({
      path: '/api/whiteboards/join',
      method: 'POST',
      body: { token: trimmed },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      const details = error.details as { reason?: unknown } | undefined
      const reason = typeof details?.reason === 'string' ? details.reason : 'unknown'
      wbJoinLogOnce(`join-failed:${error.status ?? 'unknown'}:${reason}`, {
        status: error.status ?? null,
        reason,
      })
    }
    throw error
  }
}

export default {}
