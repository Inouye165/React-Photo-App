import { useEffect, useMemo, useState } from 'react'

import { fetchRooms } from '../../api'
import { supabase } from '../../supabaseClient'
import type { ChatRoom } from '../../types/chat'
import { useAuth } from '../../contexts/AuthContext'

export interface ChatSidebarProps {
  selectedRoomId: string | null
  onSelectRoom: (roomId: string) => void
}

type RoomListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; rooms: ChatRoom[] }

type UserRow = { id: string; username: string | null }

function formatRoomTitle(room: ChatRoom, otherUsername: string | null): string {
  if (room.name && room.name.trim()) return room.name
  if (!room.is_group) return otherUsername?.trim() || 'Direct message'
  return 'Group chat'
}

export default function ChatSidebar({ selectedRoomId, onSelectRoom }: ChatSidebarProps) {
  const { user } = useAuth()

  const [roomState, setRoomState] = useState<RoomListState>({ status: 'loading' })
  const [roomToOtherUsername, setRoomToOtherUsername] = useState<Record<string, string | null>>({})

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      try {
        setRoomState({ status: 'loading' })
        const rooms = await fetchRooms()
        if (cancelled) return
        setRoomState({ status: 'ready', rooms })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!cancelled) setRoomState({ status: 'error', error: message })
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function hydrateDmTitles(rooms: ChatRoom[]): Promise<void> {
      if (!user?.id) return
      const dmRooms = rooms.filter((r) => !r.is_group && (!r.name || !r.name.trim()))
      if (!dmRooms.length) return

      const roomIds = dmRooms.map((r) => r.id)

      const { data: members, error: membersError } = await supabase
        .from('room_members')
        .select('room_id, user_id')
        .in('room_id', roomIds)

      if (membersError) throw membersError

      const roomToOtherUserId = new Map<string, string>()
      const otherUserIds = new Set<string>()

      for (const row of members ?? []) {
        const roomId = (row as { room_id?: unknown }).room_id
        const userId = (row as { user_id?: unknown }).user_id
        if (typeof roomId !== 'string') continue
        if (typeof userId !== 'string') continue
        if (userId === user.id) continue
        roomToOtherUserId.set(roomId, userId)
        otherUserIds.add(userId)
      }

      if (!otherUserIds.size) return

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, username')
        .in('id', [...otherUserIds])

      if (usersError) throw usersError

      const idToUsername = new Map<string, string | null>()
      for (const u of (users ?? []) as UserRow[]) {
        if (typeof u.id !== 'string') continue
        idToUsername.set(u.id, typeof u.username === 'string' ? u.username : null)
      }

      const next: Record<string, string | null> = {}
      for (const [roomId, otherUserId] of roomToOtherUserId.entries()) {
        next[roomId] = idToUsername.get(otherUserId) ?? null
      }

      if (!cancelled) setRoomToOtherUsername((prev) => ({ ...prev, ...next }))
    }

    if (roomState.status === 'ready') {
      hydrateDmTitles(roomState.rooms).catch((err) => {
        if (import.meta.env.DEV) {
          console.debug('[ChatSidebar] Failed to hydrate DM titles:', err)
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [roomState, user?.id])

  const rooms = useMemo(() => (roomState.status === 'ready' ? roomState.rooms : []), [roomState])

  return (
    <aside className="w-full sm:w-80 shrink-0 border-r border-slate-200 bg-white" aria-label="Chat rooms">
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Chats</h2>
        <p className="mt-1 text-xs text-slate-500">Your recent conversations</p>
      </div>

      <div className="p-2">
        {roomState.status === 'loading' && (
          <div className="p-3 text-sm text-slate-500">Loading conversations…</div>
        )}

        {roomState.status === 'error' && (
          <div className="p-3 text-sm text-red-600">Failed to load rooms: {roomState.error}</div>
        )}

        {roomState.status === 'ready' && rooms.length === 0 && (
          <div className="p-3 text-sm text-slate-500">No conversations yet.</div>
        )}

        {roomState.status === 'ready' && rooms.length > 0 && (
          <ul className="space-y-1">
            {rooms.map((room) => {
              const isSelected = selectedRoomId === room.id
              const title = formatRoomTitle(room, roomToOtherUsername[room.id] ?? null)

              return (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => onSelectRoom(room.id)}
                    className={
                      isSelected
                        ? 'w-full text-left px-3 py-3 rounded-xl bg-slate-900 text-white'
                        : 'w-full text-left px-3 py-3 rounded-xl hover:bg-slate-50 text-slate-900'
                    }
                    aria-current={isSelected ? 'page' : undefined}
                    data-testid={`chat-room-${room.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {title}
                        </div>
                        <div className={`mt-0.5 text-xs truncate ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>
                          {room.is_group ? 'Group' : 'Direct message'}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
