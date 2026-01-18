import type { Photo } from '../types/photo'
import type { ChatMessage, ChatRoom } from '../types/chat'
import { supabase } from '../supabaseClient'
import { API_BASE_URL } from './httpClient'

type PhotoId = Photo['id']

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
  if (error) throw error
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

  if (error) throw error

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
    .select('id, name, is_group, created_at')
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
      .select('id, name, is_group, created_at')
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
    .insert({ name: null, is_group: false })
    .select('id, name, is_group, created_at')
    .single()

  if (roomError) throw roomError
  if (!room) throw new Error('Failed to create room')

  const { error: selfMemberError } = await supabase
    .from('room_members')
    .insert({ room_id: (room as ChatRoom).id, user_id: userId })

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
    .insert({ name: trimmedName, is_group: true })
    .select('id, name, is_group, created_at')
    .single()

  if (roomError) throw roomError
  if (!room) throw new Error('Failed to create group room')

  const { error: selfMemberError } = await supabase
    .from('room_members')
    .insert({ room_id: (room as ChatRoom).id, user_id: userId })

  if (selfMemberError) throw selfMemberError

  const memberRows = uniqueMembers.map((id) => ({ room_id: (room as ChatRoom).id, user_id: id }))
  const { error: membersError } = await supabase
    .from('room_members')
    .insert(memberRows)

  if (membersError) throw membersError

  return room as ChatRoom
}

export async function sendMessage(roomId: string, content: string, photoId?: PhotoId | null): Promise<ChatMessage> {
  const userId = await requireAuthedUserId()
  if (!roomId) throw new Error('Missing roomId')

  const trimmed = content.trim()
  const hasPhoto = photoId != null && photoId !== ''
  if (!trimmed && !hasPhoto) throw new Error('Message content is empty')

  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, sender_id: userId, content: trimmed, photo_id: hasPhoto ? photoId : null })
    .select('id, room_id, sender_id, content, photo_id, created_at')
    .single()

  if (error) throw error
  if (!data) throw new Error('Failed to send message')
  return data as ChatMessage
}
