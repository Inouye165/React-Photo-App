import { useEffect, useMemo, useRef, useState } from 'react'

import { ChevronsLeft, ChevronsRight, SquarePen, X } from 'lucide-react'

import { createGroupRoom, fetchRooms, getOrCreateRoom, searchUsers, type UserSearchResult } from '../../api'
import { supabase } from '../../supabaseClient'
import type { ChatRoom } from '../../types/chat'
import { useAuth } from '../../contexts/AuthContext'
import { usePresence } from '../../hooks/usePresence'
import ChatWindow from './ChatWindow'

export interface ChatSidebarProps {
  selectedRoomId: string | null
  onSelectRoom: (roomId: string) => void
  showIdentityGate?: boolean
}

type RoomListState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; rooms: ChatRoom[] }

type UserRow = { id: string; username: string | null }

type UserSearchState =
  | { status: 'idle'; users: UserSearchResult[] }
  | { status: 'loading'; users: UserSearchResult[] }
  | { status: 'ready'; users: UserSearchResult[] }
  | { status: 'error'; users: UserSearchResult[]; error: string }

function formatRoomTitle(room: ChatRoom, otherUsername: string | null): string {
  if (room.name && room.name.trim()) return room.name
  if (!room.is_group) return otherUsername?.trim() || 'Direct message'
  return 'Group chat'
}

export default function ChatSidebar({
  selectedRoomId,
  onSelectRoom,
  showIdentityGate = false,
}: ChatSidebarProps) {
  const { user } = useAuth()
  const { isUserOnline } = usePresence(user?.id)
  const [viewMode, setViewMode] = useState<'list' | 'chat'>(selectedRoomId ? 'chat' : 'list')

  const [roomState, setRoomState] = useState<RoomListState>({ status: 'loading' })
  const [roomToOtherUsername, setRoomToOtherUsername] = useState<Record<string, string | null>>({})
  const [roomToOtherUserId, setRoomToOtherUserId] = useState<Record<string, string>>({})
  const [searchText, setSearchText] = useState<string>('')

  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState<boolean>(false)
  const [createMode, setCreateMode] = useState<'direct' | 'group'>('direct')
  const [groupName, setGroupName] = useState<string>('')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [userQuery, setUserQuery] = useState<string>('')
  const [userSearchState, setUserSearchState] = useState<UserSearchState>({ status: 'idle', users: [] })
  const [userSearchError, setUserSearchError] = useState<string | null>(null)
  const [creatingRoom, setCreatingRoom] = useState<boolean>(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!selectedRoomId) {
      setViewMode('list')
    }
  }, [selectedRoomId])

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      if (!user?.id) {
        setRoomToOtherUsername({})
        setRoomToOtherUserId({})
        setRoomState({ status: 'ready', rooms: [] })
        return
      }

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
  }, [user?.id])

  useEffect(() => {
    function onRoomRemoved() {
      // Re-fetch rooms when notified a room was removed/left.
      // Best-effort: ignore errors here.
      fetchRooms()
        .then((rooms) => setRoomState({ status: 'ready', rooms }))
        .catch((err) => {
          if (import.meta.env.DEV) console.debug('[ChatSidebar] Failed to refresh rooms after removal:', err)
        })
    }

    window.addEventListener('room:removed', onRoomRemoved as EventListener)
    return () => window.removeEventListener('room:removed', onRoomRemoved as EventListener)
  }, [])

  useEffect(() => {
    if (!isDiscoveryOpen) return

    // Focus input when opening
    const id = window.setTimeout(() => {
      try {
        searchInputRef.current?.focus()
      } catch {
        // ignore
      }
    }, 0)

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsDiscoveryOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isDiscoveryOpen])

  useEffect(() => {
    if (!isDiscoveryOpen) return

    const q = userQuery.trim()
    setUserSearchError(null)

    if (!q) {
      setUserSearchState({ status: 'idle', users: [] })
      return
    }

    let cancelled = false
    const debounceId = window.setTimeout(() => {
      setUserSearchState((prev) => ({ status: 'loading', users: prev.users }))

      searchUsers(q)
        .then((users) => {
          if (cancelled) return
          setUserSearchState({ status: 'ready', users })
        })
        .catch((err) => {
          if (cancelled) return
          const message = err instanceof Error ? err.message : String(err)
          setUserSearchState({ status: 'error', users: [], error: message })
        })
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(debounceId)
    }
  }, [isDiscoveryOpen, userQuery])

  useEffect(() => {
    if (isDiscoveryOpen) return
    // Reset modal state when closing
    setUserQuery('')
    setUserSearchState({ status: 'idle', users: [] })
    setUserSearchError(null)
    setCreatingRoom(false)
    setCreateMode('direct')
    setGroupName('')
    setSelectedUsers([])
  }, [isDiscoveryOpen])

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
      const nextOtherIds: Record<string, string> = {}
      for (const [roomId, otherUserId] of roomToOtherUserId.entries()) {
        next[roomId] = idToUsername.get(otherUserId) ?? null
        nextOtherIds[roomId] = otherUserId
      }

      if (!cancelled) {
        setRoomToOtherUsername((prev) => ({ ...prev, ...next }))
        setRoomToOtherUserId((prev) => ({ ...prev, ...nextOtherIds }))
      }
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

  const roomIdToSearchKey = useMemo(() => {
    const map: Record<string, string> = {}
    for (const room of rooms) {
      if (room.is_group) {
        map[room.id] = (room.name ?? '').toLowerCase()
      } else {
        map[room.id] = (roomToOtherUsername[room.id] ?? '').toLowerCase()
      }
    }
    return map
  }, [rooms, roomToOtherUsername])

  const filteredRooms = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return rooms
    return rooms.filter((room) => (roomIdToSearchKey[room.id] ?? '').includes(q))
  }, [rooms, roomIdToSearchKey, searchText])

  const selectedUserIds = useMemo(() => new Set(selectedUsers.map((u) => u.id)), [selectedUsers])

  function handleModeChange(next: 'direct' | 'group'): void {
    setCreateMode(next)
    setUserSearchError(null)
    if (next === 'direct') {
      setGroupName('')
      setSelectedUsers([])
    }
  }

  async function onPickUser(target: UserSearchResult): Promise<void> {
    if (!target?.id) return
    if (user?.id && target.id === user.id) {
      setUserSearchError('You cannot start a chat with yourself.')
      return
    }

    try {
      setCreatingRoom(true)
      setUserSearchError(null)
      const room = await getOrCreateRoom(target.id)
      onSelectRoom(room.id)
      setIsDiscoveryOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setUserSearchError(message)
    } finally {
      setCreatingRoom(false)
    }
  }

  function onToggleGroupUser(target: UserSearchResult): void {
    if (!target?.id) return
    if (user?.id && target.id === user.id) {
      setUserSearchError('You cannot add yourself to a group.')
      return
    }

    setSelectedUsers((prev) => {
      const next = prev.filter((u) => u.id !== target.id)
      if (next.length !== prev.length) return next
      return [...prev, target]
    })
  }

  async function onCreateGroup(): Promise<void> {
    try {
      setCreatingRoom(true)
      setUserSearchError(null)
      const room = await createGroupRoom(groupName, selectedUsers.map((u) => u.id))
      onSelectRoom(room.id)
      setViewMode('chat')
      setIsDiscoveryOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setUserSearchError(message)
    } finally {
      setCreatingRoom(false)
    }
  }

  const minGroupMembers = 2
  const trimmedGroupName = groupName.trim()
  const canCreateGroup =
    createMode === 'group' && Boolean(trimmedGroupName) && selectedUsers.length >= minGroupMembers && !creatingRoom

  const handleSelectRoom = (roomId: string) => {
    onSelectRoom(roomId)
    setViewMode('chat')
  }

  return (
    <aside
      className="shrink-0 border-r border-slate-200 bg-white h-full min-h-0 flex flex-col w-full"
      aria-label="Chat rooms"
    >
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-600 hover:bg-slate-100 ${
                viewMode === 'list' ? 'bg-slate-100' : ''
              }`}
              aria-label="Show chat list"
              aria-pressed={viewMode === 'list'}
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chat')}
              className={`shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-600 hover:bg-slate-100 ${
                viewMode === 'chat' ? 'bg-slate-100' : ''
              }`}
              aria-label="Open chat"
              aria-pressed={viewMode === 'chat'}
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">
                {viewMode === 'chat' ? 'Conversation' : 'Chats'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {viewMode === 'chat' ? 'Message thread' : 'Your recent conversations'}
              </p>
            </div>
          </div>

          {viewMode === 'list' && (
            <button
              type="button"
              onClick={() => setIsDiscoveryOpen(true)}
              className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
              aria-label="New message"
              data-testid="chat-new-message"
            >
              <SquarePen className="h-4 w-4" />
            </button>
          )}
        </div>

        {viewMode === 'list' && (
          <div className="mt-3">
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search"
              aria-label="Search chats"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        )}
      </div>

      {viewMode === 'list' && (
        <div className="p-2 flex-1 min-h-0 overflow-auto">
        {roomState.status === 'loading' && (
          <div className="p-3 text-sm text-slate-500">Loading conversations…</div>
        )}

        {roomState.status === 'error' && (
          <div className="p-3 text-sm text-red-600">Failed to load rooms: {roomState.error}</div>
        )}

        {roomState.status === 'ready' && filteredRooms.length === 0 && rooms.length === 0 && (
          <div className="p-3">
            <div className="text-sm text-slate-600">No conversations yet.</div>
            <button
              type="button"
              onClick={() => setIsDiscoveryOpen(true)}
              className="mt-3 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Find someone to chat with.
            </button>
          </div>
        )}

        {roomState.status === 'ready' && filteredRooms.length === 0 && rooms.length > 0 && (
          <div className="p-3 text-sm text-slate-500">No matches.</div>
        )}

        {roomState.status === 'ready' && filteredRooms.length > 0 && (
          <ul className="space-y-1">
            {filteredRooms.map((room) => {
              const isSelected = selectedRoomId === room.id
              const title = formatRoomTitle(room, roomToOtherUsername[room.id] ?? null)
              const otherUserId = room.is_group ? null : roomToOtherUserId[room.id] ?? null
              const showOnlineDot = Boolean(otherUserId) && isUserOnline(otherUserId)

              return (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectRoom(room.id)}
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

                      {!room.is_group && showOnlineDot && <div className="h-2 w-2 rounded-full bg-green-500" aria-label="Online" />}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        </div>
      )}

      {viewMode === 'chat' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatWindow roomId={selectedRoomId} showIdentityGate={showIdentityGate} mode="conversation" />
        </div>
      )}

      {isDiscoveryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Start new chat"
          onMouseDown={(e) => {
            // Click outside closes
            if (e.target === e.currentTarget) setIsDiscoveryOpen(false)
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">New message</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {createMode === 'group' ? 'Create a group chat' : 'Search by username'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Close"
                onClick={() => setIsDiscoveryOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange('direct')}
                  aria-pressed={createMode === 'direct'}
                  className={
                    createMode === 'direct'
                      ? 'rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white'
                      : 'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                  }
                >
                  Direct message
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('group')}
                  aria-pressed={createMode === 'group'}
                  className={
                    createMode === 'group'
                      ? 'rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white'
                      : 'rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                  }
                >
                  Group chat
                </button>
              </div>

              {createMode === 'group' && (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-semibold text-slate-700" htmlFor="group-name">
                    Group name
                  </label>
                  <input
                    id="group-name"
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Family, Collectors, Weekend crew"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                  <div className="text-xs text-slate-500">Pick at least {minGroupMembers} people.</div>

                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-2" aria-label="Selected group members">
                      {selectedUsers.map((u) => {
                        const username =
                          typeof u.username === 'string' && u.username.trim() ? u.username.trim() : 'Unknown'
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => onToggleGroupUser(u)}
                            className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <span className="truncate max-w-[140px]">{username}</span>
                            <span aria-hidden="true">×</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <input
                ref={searchInputRef}
                type="search"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Type a username…"
                aria-label="Search users"
                className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />

              {(userSearchError || (userSearchState.status === 'error' ? userSearchState.error : null)) && (
                <div className="mt-3 text-sm text-red-600">
                  {userSearchError ?? (userSearchState.status === 'error' ? userSearchState.error : null)}
                </div>
              )}

              <div className="mt-4">
                {userSearchState.status === 'idle' && !userQuery.trim() && (
                  <div className="text-sm text-slate-500">Start typing to find someone.</div>
                )}

                {userSearchState.status === 'loading' && (
                  <div className="text-sm text-slate-500">Searching…</div>
                )}

                {userQuery.trim() && userSearchState.status === 'ready' && userSearchState.users.length === 0 && (
                  <div className="text-sm text-slate-500">No users found with that name.</div>
                )}

                {userSearchState.users.length > 0 && (
                  <ul className="space-y-1" aria-label="User search results">
                    {userSearchState.users.map((u) => {
                      const username = typeof u.username === 'string' && u.username.trim() ? u.username.trim() : 'Unknown'
                      const isSelf = Boolean(user?.id) && u.id === user?.id
                      const isSelected = selectedUserIds.has(u.id)
                      const actionLabel = isSelected ? 'Remove' : 'Add'
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => (createMode === 'group' ? onToggleGroupUser(u) : onPickUser(u))}
                            disabled={creatingRoom || (createMode === 'group' && isSelf)}
                            aria-pressed={createMode === 'group' ? isSelected : undefined}
                            className={
                              createMode === 'group' && isSelected
                                ? 'w-full rounded-xl border border-slate-200 px-3 py-2 text-left bg-slate-50'
                                : 'w-full rounded-xl border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-60'
                            }
                            data-testid={`chat-user-result-${u.id}`}
                          >
                            <div className="flex items-center gap-3">
                              {u.avatar_url ? (
                                <img
                                  src={u.avatar_url}
                                  alt=""
                                  className="h-8 w-8 rounded-full object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200" aria-hidden="true" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900 truncate">{username}</div>
                                {user?.id && u.id === user.id && (
                                  <div className="mt-0.5 text-xs text-slate-500">This is you</div>
                                )}
                              </div>
                              {createMode === 'group' && !isSelf && (
                                <span
                                  className={
                                    isSelected
                                      ? 'ml-auto rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white'
                                      : 'ml-auto rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700'
                                  }
                                >
                                  {actionLabel}
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {createMode === 'group' && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    {selectedUsers.length < minGroupMembers
                      ? `${minGroupMembers - selectedUsers.length} more needed`
                      : `${selectedUsers.length} selected`}
                  </div>
                  <button
                    type="button"
                    onClick={onCreateGroup}
                    disabled={!canCreateGroup}
                    className={
                      canCreateGroup
                        ? 'rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800'
                        : 'rounded-xl bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 cursor-not-allowed'
                    }
                  >
                    {creatingRoom ? 'Creating…' : 'Create group'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
