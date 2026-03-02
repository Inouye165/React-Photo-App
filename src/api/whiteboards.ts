import { supabase } from '../supabaseClient'
import type { ChatRoom } from '../types/chat'
import { fetchRooms } from './chat'

async function requireAuthedUserId(): Promise<string> {
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

  const { error: selfMemberError } = await supabase
    .from('room_members')
    .insert({ room_id: (room as ChatRoom).id, user_id: userId, is_owner: true })

  if (selfMemberError) throw selfMemberError

  return room as ChatRoom
}

export default {}
