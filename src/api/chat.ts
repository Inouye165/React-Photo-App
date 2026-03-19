import type { Photo } from '../types/photo'
import type { ChatMessage, ChatRoom, ChatRoomMetadata, ChatRoomType } from '../types/chat'
import { supabase } from '../supabaseClient'
import { API_BASE_URL, ApiError, request } from './httpClient'
import { getAuthHeadersAsync } from './auth'
import { logActivity } from './activity'

type PhotoId = Photo['id']

function mapChatInsertError(err: unknown, fallback: string): Error {
  const message = err && typeof err === 'object' && 'message' in err
    ? String((err as { message?: unknown }).message || '')
    : ''
  const code = err && typeof err === 'object' && 'code' in err
    ? String((err as { code?: unknown }).code || '')
    : ''

  const isRoomsRlsInsertFailure =
    code === '42501' && message.toLowerCase().includes('row-level security policy')

  if (isRoomsRlsInsertFailure) {
    return new Error('Chat room creation is blocked by database policy (RLS). Apply chat migrations or update local rooms_insert policy for development.')
  }

  return new Error(message || fallback)
}

// --- Community Chat ---

async function requireAuthedUserId(): Promise<string> {
  const isE2E = import.meta.env.VITE_E2E === 'true' || window.__E2E_MODE__ === true

  if (isE2E) {
    const res = await fetch(`${API_BASE_URL}/api/test/e2e-verify`, { method: 'GET', credentials: 'include' })
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as
        | { success?: unknown; user?: { id?: unknown } | null }
        | null
      const id = json && json.success && json.user && typeof json.user.id === 'string' ? json.user.id : null
      if (id) return id
    }
    throw new Error('Not authenticated')
  }

  const { data, error } = await supabase.auth.getUser()
  if (error) {
    const message = error.message || 'Unable to add member to this chat.'
    throw new Error(message)
  }
  const id = data?.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}

export type UserSearchResult = {
  id: string
  username: string | null
  avatar_url: string | null
}

export type RoomMemberDetails = {
  user_id: string
  username: string | null
  avatar_url: string | null
  is_owner: boolean
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  await requireAuthedUserId()

  const { data, error } = await supabase
    .from('users')
    .select('id, username, avatar_url')
    .ilike('username', `%${q}%`)
    .limit(20)

  if (error) {
    const message = error.message || 'Unable to remove that member.'
    throw new Error(message)
  }

  const rows = (data ?? []) as Array<Partial<UserSearchResult>>
  return rows
    .filter((r): r is UserSearchResult => typeof r.id === 'string')
    .map((r) => ({
      id: r.id,
      username: typeof r.username === 'string' ? r.username : null,
      avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
    }))

}

export async function fetchRooms(): Promise<ChatRoom[]> {
  const userId = await requireAuthedUserId()

  const { data: memberRows, error: membersError } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('user_id', userId)

  if (membersError) throw membersError

  const roomIds = (memberRows ?? [])
    .map((r) => (r as { room_id?: unknown }).room_id)
    .filter((id): id is string => typeof id === 'string')

  if (roomIds.length === 0) return []

  const uniqueRoomIds = [...new Set(roomIds)]

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('id, name, is_group, created_at, type, metadata')
    .in('id', uniqueRoomIds)

  if (roomsError) throw roomsError

  const typedRooms = (rooms ?? []).filter((r): r is ChatRoom => Boolean(r && typeof (r as ChatRoom).id === 'string'))
  return typedRooms.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

export async function getOrCreateRoom(otherUserId: string): Promise<ChatRoom> {
  const userId = await requireAuthedUserId()
  if (!otherUserId) throw new Error('Missing otherUserId')
  if (otherUserId === userId) throw new Error('Cannot create a direct message room with yourself')

  const [{ data: mine, error: mineError }, { data: theirs, error: theirsError }] = await Promise.all([
    supabase.from('room_members').select('room_id').eq('user_id', userId),
    supabase.from('room_members').select('room_id').eq('user_id', otherUserId),
  ])

  if (mineError) throw mineError
  if (theirsError) throw theirsError

  const myRoomIds = new Set(
    (mine ?? [])
      .map((r) => (r as { room_id?: unknown }).room_id)
      .filter((id): id is string => typeof id === 'string'),
  )

  const commonRoomIds = (theirs ?? [])
    .map((r) => (r as { room_id?: unknown }).room_id)
    .filter((id): id is string => typeof id === 'string' && myRoomIds.has(id))

  if (commonRoomIds.length) {
    const uniqueCommon = [...new Set(commonRoomIds)]

    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, name, is_group, created_at, type, metadata')
      .in('id', uniqueCommon)
      .eq('is_group', false)

    if (roomsError) throw roomsError

    const candidates = (rooms ?? []) as ChatRoom[]
    if (candidates.length) {
      candidates.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      return candidates[0]
    }
  }

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ name: null, is_group: false, created_by: userId })
    .select('id, name, is_group, created_at, type, metadata')
    .single()

  if (roomError) throw mapChatInsertError(roomError, 'Failed to create room')
  if (!room) throw new Error('Failed to create room')

  const { error: selfMemberError } = await supabase
    .from('room_members')
    .insert({ room_id: (room as ChatRoom).id, user_id: userId, is_owner: true })

  if (selfMemberError) throw selfMemberError

  const { error: otherMemberError } = await supabase
    .from('room_members')
    .insert({ room_id: (room as ChatRoom).id, user_id: otherUserId })

  if (otherMemberError) throw otherMemberError
  return room as ChatRoom
}

export async function createGroupRoom(name: string, memberIds: string[]): Promise<ChatRoom> {
  const userId = await requireAuthedUserId()
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Group name is required')

  const uniqueMembers = [...new Set(memberIds)].filter((id) => typeof id === 'string' && id && id !== userId)
  if (uniqueMembers.length < 2) throw new Error('Pick at least 2 people for a group chat')

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ name: trimmedName, is_group: true, created_by: userId })
    .select('id, name, is_group, created_at, type, metadata')
    .single()

  if (roomError) throw mapChatInsertError(roomError, 'Failed to create group room')
  if (!room) throw new Error('Failed to create group room')

  const { error: selfMemberError } = await supabase
    .from('room_members')
    .insert({ room_id: (room as ChatRoom).id, user_id: userId, is_owner: true })

  if (selfMemberError) throw selfMemberError

  const memberRows = uniqueMembers.map((id) => ({ room_id: (room as ChatRoom).id, user_id: id }))
  const { error: membersError } = await supabase
    .from('room_members')
    .insert(memberRows)

  if (membersError) throw membersError

  return room as ChatRoom
}

export async function addRoomMember(roomId: string, userId: string): Promise<void> {
  const currentUserId = await requireAuthedUserId()
  if (!roomId) throw new Error('Missing roomId')
  if (!userId) throw new Error('Missing userId')
  if (userId === currentUserId) throw new Error('You are already a member')

  const { error } = await supabase
    .from('room_members')
    .insert({ room_id: roomId, user_id: userId, is_owner: false })

  if (error) {
    const message = error.message || 'Unable to leave this chat.'
    throw new Error(message)
  }
}

export async function listRoomMembers(roomId: string): Promise<RoomMemberDetails[]> {
  await requireAuthedUserId()
  if (!roomId) throw new Error('Missing roomId')

  const { data: members, error: membersError } = await supabase
    .from('room_members')
    .select('user_id, is_owner')
    .eq('room_id', roomId)

  if (membersError) {
    const message = membersError.message || 'Unable to load room members.'
    throw new Error(message)
  }

  const memberRows = (members ?? []) as Array<{ user_id?: unknown; is_owner?: unknown }>
  const memberMap = new Map<string, { is_owner: boolean }>()
  for (const row of memberRows) {
    if (typeof row.user_id !== 'string') continue
    memberMap.set(row.user_id, { is_owner: Boolean(row.is_owner) })
  }

  const memberIds = [...memberMap.keys()]
  if (!memberIds.length) return []

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, avatar_url')
    .in('id', memberIds)

  if (usersError) {
    const message = usersError.message || 'Unable to load room members.'
    throw new Error(message)
  }

  const userRows = (users ?? []) as Array<{ id?: unknown; username?: unknown; avatar_url?: unknown }>
  const byUserId = new Map<string, { username: string | null; avatar_url: string | null }>()
  for (const row of userRows) {
    if (typeof row.id !== 'string') continue
    byUserId.set(row.id, {
      username: typeof row.username === 'string' ? row.username : null,
      avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    })
  }

  return memberIds.map((userId) => {
    const user = byUserId.get(userId)
    return {
      user_id: userId,
      username: user?.username ?? null,
      avatar_url: user?.avatar_url ?? null,
      is_owner: memberMap.get(userId)?.is_owner ?? false,
    }
  })
}

export async function removeRoomMember(roomId: string, userId: string): Promise<void> {
  await requireAuthedUserId()
  if (!roomId) throw new Error('Missing roomId')
  if (!userId) throw new Error('Missing userId')

  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId)

  if (error) {
    const message = error.message || 'Unable to update owner permissions.'
    throw new Error(message)
  }
}

export async function quitRoom(roomId: string): Promise<void> {
  const currentUserId = await requireAuthedUserId()
  if (!roomId) throw new Error('Missing roomId')

  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', currentUserId)

  if (error) throw error
}

export async function leaveOrDeleteRoom(roomId: string): Promise<void> {
  await requireAuthedUserId()
  if (!roomId) throw new Error('Missing roomId')

  // Call Postgres RPC that will either soft-delete the room (if owner) or mark
  // the membership deleted (soft delete via deleted_at). Expect RLS to filter by deleted_at IS NULL.
  const { error } = await supabase.rpc('leave_or_delete_room', { target_room_id: roomId })

  if (error) {
    const message = error.message || 'Unable to leave or delete the chat.'
    throw new Error(message)
  }

  return
}

export async function setRoomOwner(roomId: string, userId: string, isOwner: boolean): Promise<void> {
  await requireAuthedUserId()
  if (!roomId) throw new Error('Missing roomId')
  if (!userId) throw new Error('Missing userId')

  const { error } = await supabase
    .from('room_members')
    .update({ is_owner: isOwner })
    .eq('room_id', roomId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function sendMessage(roomId: string, content: string, photoId?: PhotoId | null): Promise<ChatMessage> {
  if (!roomId) throw new Error('Missing roomId')

  const trimmed = content.trim()
  const hasPhoto = photoId != null && photoId !== ''
  if (!trimmed && !hasPhoto) throw new Error('Message content is empty')

  const headers = await getAuthHeadersAsync(true)
  let data: ChatMessage

  try {
    data = await request<ChatMessage>({
      path: `/api/v1/chat/rooms/${roomId}/messages`,
      method: 'POST',
      headers,
      body: {
        content: trimmed,
        photoId: hasPhoto ? photoId : null,
      },
    })
  } catch (error) {
    console.error('[CHAT-SEND] request failed', {
      roomId,
      hasPhoto,
      contentLength: trimmed.length,
      status: error instanceof ApiError ? error.status ?? null : null,
      code: error instanceof ApiError ? error.code ?? null : null,
      details: error instanceof ApiError ? error.details ?? null : null,
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  if (!data) throw new Error('Failed to send message')

  if (import.meta.env.DEV) {
    try {
      console.log('[api/chat] sendMessage inserted', { roomId, data })
    } catch {
      // ignore
    }
  }

  // Log message_sent activity (fire-and-forget)
  logActivity('message_sent', { roomId })

  return data as ChatMessage
}

export async function patchChatRoom(
  roomId: string,
  updates: { type?: ChatRoomType; metadata?: Partial<ChatRoomMetadata> },
): Promise<{ success: true; room: ChatRoom }> {
  if (!roomId) throw new Error('Missing roomId')

  const headers = await getAuthHeadersAsync(true)

  const response = await request<{ success: true; room: ChatRoom }>({
    path: `/api/v1/chat/rooms/${roomId}`,
    method: 'PATCH',
    headers,
    body: updates,
  })

  if (!response?.success) {
    throw new Error('Failed to update chat room')
  }

  return response
}
