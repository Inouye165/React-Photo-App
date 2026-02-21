import type { Photo } from '../types/photo'
import type { ChatMessage, ChatRoom, ChatRoomMetadata, ChatRoomType } from '../types/chat'
import { supabase } from '../supabaseClient'
import { API_BASE_URL, request } from './httpClient'
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
  console.log('[fetchRooms] START userId=', userId)

  const { data: memberRows, error: membersError } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('user_id', userId)

  if (membersError) {
    console.error('[fetchRooms] room_members SELECT error:', membersError)
    throw membersError
  }

  const roomIds = (memberRows ?? [])
    .map((r) => (r as { room_id?: unknown }).room_id)
    .filter((id): id is string => typeof id === 'string')

  console.log('[fetchRooms] memberRows=', memberRows?.length, 'roomIds=', roomIds)
  if (roomIds.length === 0) return []

  const uniqueRoomIds = [...new Set(roomIds)]

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('id, name, is_group, created_at, type, metadata')
    .in('id', uniqueRoomIds)

  if (roomsError) {
    console.error('[fetchRooms] rooms SELECT error:', roomsError)
    throw roomsError
  }

  const typedRooms = (rooms ?? []).filter((r): r is ChatRoom => Boolean(r && typeof (r as ChatRoom).id === 'string'))
  console.log('[fetchRooms] DONE rooms=', typedRooms.map(r => ({ id: r.id, name: r.name })))
  return typedRooms.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

export async function getOrCreateRoom(otherUserId: string): Promise<ChatRoom> {
  const userId = await requireAuthedUserId()
  if (!otherUserId) throw new Error('Missing otherUserId')
  if (otherUserId === userId) throw new Error('Cannot create a direct message room with yourself')

  const headers = await getAuthHeadersAsync(true)
  const response = await request<{ success: true; room: ChatRoom }>({
    path: '/api/v1/chat/rooms/direct',
    method: 'POST',
    headers,
    body: { otherUserId },
  })

  if (!response?.success || !response.room) {
    throw new Error('Failed to create room')
  }

  return response.room
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
  console.log('[sendMessage] START roomId=', roomId, 'contentLen=', content?.length)
  let userId: string
  try {
    userId = await requireAuthedUserId()
    console.log('[sendMessage] authed as userId=', userId)
  } catch (authErr) {
    console.error('[sendMessage] AUTH FAILED:', authErr)
    throw authErr
  }
  if (!roomId) throw new Error('Missing roomId')

  const trimmed = content.trim()
  const hasPhoto = photoId != null && photoId !== ''
  if (!trimmed && !hasPhoto) throw new Error('Message content is empty')

  console.log('[sendMessage] calling supabase insert room=', roomId, 'sender=', userId, 'content=', JSON.stringify(trimmed).substring(0, 40))
  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, sender_id: userId, content: trimmed, photo_id: hasPhoto ? photoId : null })
    .select('id, room_id, sender_id, content, photo_id, created_at')
    .single()

  if (error) {
    console.error('[sendMessage] supabase INSERT ERROR code=', error.code, 'msg=', error.message, 'details=', error.details, 'hint=', error.hint)
    throw error
  }
  if (!data) {
    console.error('[sendMessage] INSERT returned no data (null)')
    throw new Error('Failed to send message')
  }
  console.log('[sendMessage] SUCCESS id=', (data as ChatMessage).id)

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
