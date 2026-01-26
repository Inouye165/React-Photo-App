import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import {
  ArrowDown,
  Image as ImageIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Settings,
  Users,
  X,
} from 'lucide-react'

import { API_BASE_URL, getAccessToken, getPhotos, patchChatRoom, sendMessage, leaveOrDeleteRoom } from '../../api'
import { useNavigate } from 'react-router-dom'
import { useChatRealtime } from '../../hooks/useChatRealtime'
import { usePresence } from '../../hooks/usePresence'
import { useChatTyping } from '../../hooks/useChatTyping'
import { supabase } from '../../supabaseClient'
import type { ChatMessage, ChatRoomMetadata, ChatRoomType } from '../../types/chat'
import { useAuth } from '../../contexts/AuthContext'
import { toUrl } from '../../utils/toUrl'
import AuthenticatedImage from '../AuthenticatedImage'
import ChatBubble from './ChatBubble'
import ChatMembersModal from './ChatMembersModal'
import ChatSettingsModal from './ChatSettingsModal'
import PotluckWidget from './widgets/PotluckWidget'
import LocationMapPanel from '../LocationMapPanel'
import { IdentityGateInline, useIdentityGateStatus } from '../IdentityGate'

export interface ChatWindowProps {
  roomId: string | null
  showIdentityGate?: boolean
}

type UserRow = { id: string; username: string | null }
type RoomRow = {
  id: string
  name: string | null
  is_group: boolean | null
  type?: string | null
  metadata?: unknown
  created_by?: string | null
}

type MemberProfile = {
  username: string | null
  avatarUrl: string | null
  isOwner: boolean
}

type ChatHeaderState = {
  title: string
  isGroup: boolean
  otherUserId: string | null
}

type DashboardWidgetKey = 'potluck' | 'map' | 'details'

type DashboardCardProps = {
  title: string
  onToggleExpand?: () => void
  isExpanded?: boolean
  children: ReactNode
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatWindow({ roomId, showIdentityGate }: ChatWindowProps) {
  const { user, profile } = useAuth()
  const { messages, loading, error } = useChatRealtime(roomId, { userId: user?.id ?? null })
  const { isUserOnline } = usePresence(user?.id)

  const [draft, setDraft] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [pickerOpen, setPickerOpen] = useState<boolean>(false)
  const [pickerLoading, setPickerLoading] = useState<boolean>(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [pickerPhotos, setPickerPhotos] = useState<Array<{ id: number; thumbnail?: string; url?: string }>>([])
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null)
  const [pickerReloadKey, setPickerReloadKey] = useState<number>(0)

  const [memberIds, setMemberIds] = useState<string[]>([])
  const [memberDirectory, setMemberDirectory] = useState<Record<string, string | null>>({})
  const [memberProfiles, setMemberProfiles] = useState<Record<string, MemberProfile>>({})
  const [header, setHeader] = useState<ChatHeaderState>({ title: 'Conversation', isGroup: false, otherUserId: null })
  const [roomType, setRoomType] = useState<ChatRoomType>('general')
  const [roomMetadata, setRoomMetadata] = useState<ChatRoomMetadata>({})
  const [createdBy, setCreatedBy] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [isMembersOpen, setIsMembersOpen] = useState<boolean>(false)
  const [expandedWidget, setExpandedWidget] = useState<DashboardWidgetKey | null>(null)
  const navigate = useNavigate()

  // Typing indicator hook (best-effort; no UI crash if Realtime unavailable)
  const { typingUsernames, handleInputChange, handleInputSubmit } = useChatTyping({
    roomId: roomId ?? '',
    userId: user?.id ?? '',
    supabase,
    participants: Object.entries(memberDirectory).map(([id, username]) => ({
      userId: id,
      username: username ?? undefined,
    })),
  })

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const prevMessageCountRef = useRef<number>(0)
  
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true)
  const [unseenCount, setUnseenCount] = useState<number>(0)

  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMarkReadAtRef = useRef<number>(0)

  useEffect(() => {
    setMemberIds([])
    setMemberDirectory({})
    setMemberProfiles({})
    setHeader({ title: 'Conversation', isGroup: false, otherUserId: null })
    setRoomType('general')
    setRoomMetadata({})
    setCreatedBy(null)
  }, [user?.id])

  const fetchMemberRoster = useCallback(async () => {
    if (!roomId || !user?.id) {
      return {
        ids: [] as string[],
        directory: {} as Record<string, string | null>,
        profiles: {} as Record<string, MemberProfile>,
      }
    }

    const { data: members, error: membersError } = await supabase
      .from('room_members')
      .select('user_id, is_owner')
      .eq('room_id', roomId)

    if (membersError) throw membersError

    const memberRows = (members ?? []) as Array<{ user_id?: unknown; is_owner?: unknown }>
    const ids = memberRows.map((row) => row.user_id).filter((id): id is string => typeof id === 'string')
    const uniqueIds = [...new Set(ids)]

    const baseProfiles: Record<string, MemberProfile> = {}
    for (const row of memberRows) {
      if (typeof row.user_id !== 'string') continue
      baseProfiles[row.user_id] = {
        username: null,
        avatarUrl: null,
        isOwner: Boolean(row.is_owner),
      }
    }

    if (!uniqueIds.length) {
      return {
        ids: uniqueIds,
        directory: {},
        profiles: baseProfiles,
      }
    }

    const { data, error: usersError } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in('id', uniqueIds)

    if (usersError) throw usersError

    const nextDirectory: Record<string, string | null> = {}
    const nextProfiles: Record<string, MemberProfile> = { ...baseProfiles }
    for (const row of (data ?? []) as Array<UserRow & { avatar_url?: string | null }>) {
      if (typeof row.id !== 'string') continue
      const username = typeof row.username === 'string' ? row.username : null
      nextDirectory[row.id] = username
      const existing = nextProfiles[row.id]
      nextProfiles[row.id] = {
        username,
        avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
        isOwner: existing?.isOwner ?? false,
      }
    }

    return {
      ids: uniqueIds,
      directory: nextDirectory,
      profiles: nextProfiles,
    }
  }, [roomId, user?.id])

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      const roster = await fetchMemberRoster()
      if (cancelled) return
      setMemberIds(roster.ids)
      setMemberDirectory(roster.directory)
      setMemberProfiles(roster.profiles)
    }

    run().catch((err) => {
      if (import.meta.env.DEV) console.debug('[ChatWindow] Failed to resolve room members:', err)
    })

    return () => {
      cancelled = true
    }
  }, [fetchMemberRoster])

  const scheduleMarkRead = useCallback(
    (reason: 'open' | 'at-bottom' | 'new-message') => {
      if (!roomId || !user?.id) return

      const now = Date.now()
      // Avoid spamming updates during rapid message bursts / scroll events.
      if (now - lastMarkReadAtRef.current < 750) return

      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current)

      markReadTimerRef.current = setTimeout(async () => {
        markReadTimerRef.current = null
        lastMarkReadAtRef.current = Date.now()

        try {
          const { error } = await supabase
            .from('room_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('room_id', roomId)
            .eq('user_id', user.id)

          if (error) throw error
        } catch (err) {
          if (import.meta.env.DEV) console.error(`[ChatWindow] Failed to mark read (${reason}):`, err)
        }
      }, 250)
    },
    [roomId, user?.id],
  )

  // Mark room as read when opening
  useEffect(() => {
    if (!roomId || !user?.id) return
    scheduleMarkRead('open')
  }, [roomId, user?.id, scheduleMarkRead])

  // If new messages arrive while user is already at the bottom, treat them as viewed.
  useEffect(() => {
    if (!roomId || !user?.id) return
    if (!isAtBottom) return
    if (messages.length <= 0) return
    scheduleMarkRead('new-message')
  }, [roomId, user?.id, messages.length, isAtBottom, scheduleMarkRead])

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      if (!roomId || !user?.id) {
        setHeader({ title: 'Conversation', isGroup: false, otherUserId: null })
        setRoomType('general')
        setRoomMetadata({})
        setCreatedBy(null)
        return
      }

      setHeader({ title: 'Conversation', isGroup: false, otherUserId: null })
      setRoomType('general')
      setRoomMetadata({})

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id, name, is_group, type, metadata, created_by')
        .eq('id', roomId)
        .maybeSingle()

      if (roomError) throw roomError

      const roomRow = (room ?? null) as RoomRow | null
      const isGroup = Boolean(roomRow?.is_group)
      const roomName = typeof roomRow?.name === 'string' ? roomRow?.name : null
      const resolvedType: ChatRoomType = roomRow?.type === 'potluck' ? 'potluck' : 'general'
      const resolvedMetadata =
        roomRow?.metadata && typeof roomRow.metadata === 'object' ? (roomRow.metadata as ChatRoomMetadata) : {}

      if (!cancelled) {
        setRoomType(resolvedType)
        setRoomMetadata(resolvedMetadata)
        setCreatedBy(typeof roomRow?.created_by === 'string' ? roomRow.created_by : null)
      }

      if (isGroup) {
        if (!cancelled) setHeader({ title: roomName?.trim() || 'Group chat', isGroup: true, otherUserId: null })
        return
      }

      const { data: memberRow, error: memberError } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId)
        .neq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (memberError) throw memberError

      const otherUserId = (memberRow as { user_id?: unknown } | null)?.user_id
      const otherId = typeof otherUserId === 'string' ? otherUserId : null
      if (!otherId) {
        if (!cancelled) setHeader({ title: roomName?.trim() || 'Direct message', isGroup: false, otherUserId: null })
        return
      }

      const { data: otherUser, error: otherUserError } = await supabase
        .from('users')
        .select('id, username')
        .eq('id', otherId)
        .maybeSingle()

      if (otherUserError) throw otherUserError

      const username = (otherUser as UserRow | null)?.username
      const title = typeof username === 'string' && username.trim() ? username.trim() : roomName?.trim() || 'Direct message'

      if (!cancelled) setHeader({ title, isGroup: false, otherUserId: otherId })
    }

    run().catch((err) => {
      if (import.meta.env.DEV) console.debug('[ChatWindow] Failed to resolve chat header:', err)
    })

    return () => {
      cancelled = true
    }
  }, [roomId, user?.id])

  useEffect(() => {
    // Auto-scroll on new messages (and when switching rooms)
    // Only scroll if user is at bottom
    if (isAtBottom) {
      try {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      } catch {
        bottomRef.current?.scrollIntoView()
      }
    } else {
      // User is scrolled up; track new messages
      const delta = messages.length - prevMessageCountRef.current
      if (delta > 0) {
        setUnseenCount((prev) => prev + delta)
      }
    }
    prevMessageCountRef.current = messages.length
  }, [roomId, messages.length, isAtBottom])

  const currentUserIsOwner = Boolean(user?.id && memberProfiles[user.id]?.isOwner)
  const canEditSettings = !header.isGroup || currentUserIsOwner

  useEffect(() => {
    setDraft('')
    setSendError(null)
    setSending(false)
    setExpandedWidget(null)
    setPickerOpen(false)
    setPickerError(null)
    setPickerLoading(false)
    setPickerPhotos([])
    setSelectedPhotoId(null)
    setUnseenCount(0)
    setIsAtBottom(true)
    setIsMembersOpen(false)
    prevMessageCountRef.current = 0
  }, [roomId])

  useEffect(() => {
    if (!canEditSettings) {
      setIsSettingsOpen(false)
    }
  }, [canEditSettings])

  useEffect(() => {
    if (!pickerOpen) return
    if (pickerPhotos.length) return

    let cancelled = false
    const controller = new AbortController()
    const HARD_TIMEOUT_MS = 12_000
    const hardTimeoutId = setTimeout(() => {
      if (cancelled) return
      try {
        controller.abort()
      } catch {
        // ignore
      }
      setPickerError((prev) => prev ?? `Timed out loading photos after ${HARD_TIMEOUT_MS / 1000}s`)
      setPickerLoading(false)
    }, HARD_TIMEOUT_MS)

    async function run(): Promise<void> {
      try {
        setPickerLoading(true)
        setPickerError(null)
        // Load first page of photos (default limit 50 from backend) - sufficient for picker
        const res = await getPhotos(undefined, { signal: controller.signal, timeoutMs: HARD_TIMEOUT_MS })
        if (cancelled) return
        const list = (res?.success && Array.isArray(res.photos) ? res.photos : []) as Array<{ id: number | string; thumbnail?: string; url?: string }>
        const normalized = list
          .map((p) => ({
            id: typeof p.id === 'number' ? p.id : Number(p.id),
            thumbnail: typeof p.thumbnail === 'string' ? p.thumbnail : undefined,
            url: typeof p.url === 'string' ? p.url : undefined,
          }))
          .filter((p) => Number.isFinite(p.id) && p.id > 0)
          .slice(0, 24)

        setPickerPhotos(normalized)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!cancelled) {
          // AbortErrors are expected when the picker is closed or times out.
          if (err && typeof err === 'object' && 'name' in err && (err as { name?: unknown }).name === 'AbortError') {
            setPickerError((prev) => prev ?? 'Request cancelled')
          } else {
            setPickerError(message)
          }
        }
        if (import.meta.env.DEV) console.warn('[ChatWindow] Failed to load picker photos', err)
      } finally {
        clearTimeout(hardTimeoutId)
        if (!cancelled) setPickerLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
      clearTimeout(hardTimeoutId)
      try {
        controller.abort()
      } catch {
        // ignore
      }
    }
  }, [pickerOpen, pickerPhotos.length, pickerReloadKey, roomId])

  const canSend = Boolean(roomId) && !sending

  function checkIfAtBottom(): void {
    const container = scrollContainerRef.current
    if (!container) return
    
    const threshold = 100
    const { scrollHeight, scrollTop, clientHeight } = container
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold
    
    setIsAtBottom(isNearBottom)
    if (isNearBottom) {
      setUnseenCount(0)
      scheduleMarkRead('at-bottom')
    }
  }

  function scrollToBottom(): void {
    try {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    } catch {
      bottomRef.current?.scrollIntoView()
    }
    setUnseenCount(0)
    setIsAtBottom(true)
  }

  async function onSend(): Promise<void> {
    if (!roomId) return
    const trimmed = draft.trim()
    if (!trimmed && selectedPhotoId == null) return

    // Best-effort: stop typing indicator as soon as user submits.
    handleInputSubmit()

    try {
      setSending(true)
      setSendError(null)
      await sendMessage(roomId, trimmed, selectedPhotoId)
      setDraft('')
      setSelectedPhotoId(null)
      setPickerOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSendError(message)
    } finally {
      setSending(false)
    }
  }

  const selectedPhoto = useMemo(() => {
    if (selectedPhotoId == null) return null
    return pickerPhotos.find((p) => p.id === selectedPhotoId) || { id: selectedPhotoId }
  }, [pickerPhotos, selectedPhotoId])

  const selectedPreviewUrl = useMemo(() => {
    if (!selectedPhoto) return null
    const rel = selectedPhoto.thumbnail || selectedPhoto.url
    if (!rel) return null
    return toUrl(rel, API_BASE_URL)
  }, [selectedPhoto])

  function getSenderLabel(message: ChatMessage): string {
    if (user?.id && message.sender_id === user.id) {
      return profile?.username?.trim() || 'You'
    }
    return memberDirectory[message.sender_id]?.trim() || 'Unknown'
  }

  const memberDisplay = useMemo(() => {
    if (!memberIds.length) return []
    return memberIds.map((id) => {
      const label = user?.id && id === user.id
        ? profile?.username?.trim() || 'You'
        : memberDirectory[id]?.trim() || 'Unknown'
      return {
        id,
        label,
        isOwner: Boolean(memberProfiles[id]?.isOwner),
      }
    })
  }, [memberIds, memberDirectory, memberProfiles, profile?.username, user?.id])

  const membersForModal = useMemo(() => {
    return memberIds.map((id) => {
      const profileRow = memberProfiles[id]
      return {
        userId: id,
        username: profileRow?.username ?? memberDirectory[id] ?? null,
        avatarUrl: profileRow?.avatarUrl ?? null,
        isOwner: Boolean(profileRow?.isOwner),
      }
    })
  }, [memberDirectory, memberIds, memberProfiles])

  const ownerIdSet = useMemo(() => {
    const owners = new Set<string>()
    for (const [id, profileRow] of Object.entries(memberProfiles)) {
      if (profileRow?.isOwner) owners.add(id)
    }
    return owners
  }, [memberProfiles])

  const handlePatchRoom = useCallback(
    async (updates: { type?: ChatRoomType; metadata?: ChatRoomMetadata }) => {
      if (!roomId) return
      try {
        const response = await patchChatRoom(roomId, updates)
        const updatedRoom = response.room
        setRoomType(updatedRoom.type)
        setRoomMetadata(updatedRoom.metadata || {})
      } catch (err) {
        if (import.meta.env.DEV) {
          console.debug('[ChatWindow] Failed to update room settings:', err)
        }
      }
    },
    [roomId],
  )

  const handleLeaveRoom = useCallback(async (): Promise<void> => {
    if (!roomId) return
    await leaveOrDeleteRoom(roomId)

    // Notify other UI (sidebar) to refresh and optimistically remove room.
    try {
      window.dispatchEvent(new CustomEvent('room:removed', { detail: { roomId } }))
    } catch {
      // ignore
    }

    // Navigate back to chat root
    try {
      navigate('/chat')
    } catch {
      // fallback: nothing
    }
  }, [roomId, navigate])

  const potluck = roomMetadata.potluck || { items: [], allergies: [] }
  const potluckLocation = potluck.location
  const addressLabel = potluckLocation?.address?.trim() || null
  const hasLatLng =
    potluckLocation != null && Number.isFinite(potluckLocation.lat) && Number.isFinite(potluckLocation.lng)
  const mapPhoto = hasLatLng
    ? { metadata: { latitude: potluckLocation?.lat, longitude: potluckLocation?.lng } }
    : null

  const handleToggleWidget = (key: DashboardWidgetKey) => {
    setExpandedWidget((prev) => (prev === key ? null : key))
  }
  const gateStatus = useIdentityGateStatus()
  const shouldShowIdentityGate = Boolean(showIdentityGate) && gateStatus.type !== 'allow'

  function DashboardCard({ title, onToggleExpand, isExpanded, children }: DashboardCardProps) {
    return (
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
        </div>
        <div className="p-4 text-sm text-slate-700">{children}</div>
      </section>
    )
  }

  if (shouldShowIdentityGate) {
    return (
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section
          className="flex flex-col h-full min-h-0 bg-slate-50 border-r border-slate-200"
          aria-label="Chat window"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
            <span className="text-sm font-semibold text-slate-900">Join room</span>
          </div>
          <div className="flex-1 min-h-0 p-4 sm:p-6">
            <IdentityGateInline status={gateStatus} />
          </div>
        </section>

        <section className="relative h-full min-h-0 bg-slate-50" aria-label="Dashboard widgets">
          <div className="h-full flex items-center justify-center p-6 text-sm text-slate-500">
            Complete your profile to join this room.
          </div>
        </section>
      </div>
    )
  }

  if (!roomId) {
    return (
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section
          className="flex flex-col h-full min-h-0 bg-slate-50 border-r border-slate-200"
          aria-label="Chat window"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
            <span className="text-sm font-semibold text-slate-900">Chat</span>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center">
              <h2 className="text-base font-semibold text-slate-900">Select a conversation</h2>
              <p className="mt-2 text-sm text-slate-600">Choose a room to start chatting.</p>
            </div>
          </div>
        </section>

        <section className="relative h-full min-h-0 bg-slate-50" aria-label="Dashboard widgets">
          <div className="h-full flex items-center justify-center p-6 text-sm text-slate-500">
            Pick a room to see planning widgets.
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section
        className="flex flex-col h-full min-h-0 bg-slate-50 border-r border-slate-200 relative"
        aria-label="Chat window"
      >
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            {!header.isGroup && header.otherUserId && isUserOnline(header.otherUserId) && (
              <div className="h-2 w-2 rounded-full bg-green-500" aria-label="Online" />
            )}
            <h2 className="text-sm font-semibold text-slate-900 truncate">{header.title}</h2>
            <div className="ml-auto flex items-center gap-2">
              {header.isGroup && (
                <button
                  type="button"
                  onClick={() => setIsMembersOpen(true)}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-slate-600 hover:bg-slate-100"
                  aria-label="Manage members"
                >
                  <Users className="h-4 w-4" />
                </button>
              )}
              {canEditSettings && (
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-slate-600 hover:bg-slate-100"
                  aria-label="Chat settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate" aria-label="Chat members">
            {memberDisplay.length > 0 ? (
              <span>
                Members:{' '}
                {memberDisplay.map((member, index) => (
                  <span key={member.id}>
                    <span className={member.isOwner ? 'text-emerald-700 font-semibold' : 'text-slate-600'}>
                      {member.label}
                    </span>
                    {index < memberDisplay.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </span>
            ) : (
              'Members unavailable'
            )}
          </div>
        </div>

      <div 
        ref={scrollContainerRef}
        onScroll={checkIfAtBottom}
        className="flex-1 overflow-auto p-4 sm:p-6 space-y-3" 
        data-testid="chat-messages"
      >
        {loading && <div className="text-sm text-slate-500">Loading messages…</div>}
        {error && <div className="text-sm text-red-600">Failed to load messages: {error}</div>}

        {!loading && !error && messages.length === 0 && (
          <div className="text-sm text-slate-500">No messages yet. Say hi.</div>
        )}

        {messages.map((m) => {
          const isOwn = Boolean(user?.id) && m.sender_id === user?.id
          return (
            <ChatBubble
              key={m.id}
              message={m}
              roomId={roomId}
              isOwn={isOwn}
              senderLabel={getSenderLabel(m)}
              timestampLabel={formatTime(m.created_at)}
            />
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* New messages notification pill */}
      {unseenCount > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <button
            type="button"
            onClick={scrollToBottom}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-medium shadow-lg hover:bg-slate-800 transition-colors"
            aria-label="Jump to latest messages"
          >
            <ArrowDown className="h-4 w-4" />
            <span>New messages ({unseenCount}) · Jump to latest</span>
          </button>
        </div>
      )}

      <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
        {sendError && <div className="mb-2 text-sm text-red-600">{sendError}</div>}

        {selectedPhoto && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            {selectedPreviewUrl ? (
              <img
                src={selectedPreviewUrl}
                alt="Selected photo"
                className="h-12 w-12 rounded-xl object-cover border border-slate-200"
              />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-slate-200" aria-label="Selected photo" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700 truncate">Photo #{selectedPhoto.id}</div>
              <div className="text-[11px] text-slate-500 truncate">Attached to next message</div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPhotoId(null)}
              className="inline-flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Remove attached photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {pickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/20">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Photo picker"
              className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Select a photo</div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100"
                  aria-label="Close photo picker"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {pickerLoading && <div className="mt-3 text-sm text-slate-500">Loading photos…</div>}
              {pickerError && (
                <div className="mt-3 text-sm text-red-600">
                  Failed to load photos: {pickerError}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setPickerError(null)
                      setPickerReloadKey((v) => v + 1)
                    }}
                    className="underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!pickerLoading && !pickerError && pickerPhotos.length === 0 && (
                <div className="mt-3 text-sm text-slate-500">No photos available.</div>
              )}

              {!pickerLoading && !pickerError && pickerPhotos.length > 0 && (
                <div className="mt-4 grid grid-cols-8 sm:grid-cols-10 gap-2">
                  {pickerPhotos.map((p) => {
                    const rel = p.thumbnail || p.url
                    const src = rel ? toUrl(rel, API_BASE_URL) : null
                    const isSignedThumbnail =
                      typeof rel === 'string' &&
                      rel.includes('/display/thumbnails/') &&
                      rel.includes('sig=') &&
                      rel.includes('exp=')
                    const isSelected = selectedPhotoId === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPhotoId(p.id)
                          setPickerOpen(false)
                        }}
                        className={
                          isSelected
                            ? 'relative aspect-square w-full rounded-xl border-2 border-slate-900 overflow-hidden'
                            : 'relative aspect-square w-full rounded-xl border border-slate-200 overflow-hidden hover:border-slate-400'
                        }
                        aria-label={`Attach photo ${p.id}`}
                      >
                        {src ? (
                          isSignedThumbnail ? (
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <AuthenticatedImage src={src} alt="" className="h-full w-full object-cover" />
                          )
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSend()
          }}
        >
          <button
            type="button"
            disabled={sending}
            onClick={() => {
              // Keep token warm so fetches that require Authorization can work immediately.
              // (Picker thumbnails are usually signed and don't need this, but it's safe.)
              getAccessToken()
              setPickerOpen((v) => {
                const next = !v
                if (!next) {
                  setPickerLoading(false)
                }
                return next
              })
            }}
            className="inline-flex items-center justify-center h-10 w-10 rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
            aria-label="Attach photo"
          >
            <ImageIcon className="h-5 w-5" />
          </button>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              handleInputChange()
            }}
            placeholder="Write a message…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="submit"
            disabled={!canSend || (!draft.trim() && selectedPhotoId == null)}
            className={
              !canSend || (!draft.trim() && selectedPhotoId == null)
                ? 'px-4 py-3 rounded-2xl bg-slate-200 text-slate-500 text-sm font-semibold cursor-not-allowed'
                : 'px-4 py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800'
            }
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
        {/* Typing indicator UI */}
        {typingUsernames.length > 0 && (
          <div className="mt-2 text-xs text-slate-500" data-testid="chat-typing-indicator">
            {typingUsernames.length === 1
              ? `${typingUsernames[0]} is typing…`
              : 'Someone is typing…'}
          </div>
        )}
      </div>

      {canEditSettings && (
        <ChatSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          roomType={roomType}
          metadata={roomMetadata}
          currentUserId={user?.id ?? null}
          onSave={async (patch) => handlePatchRoom(patch)}
          onLeave={handleLeaveRoom}
          isGroup={header.isGroup}
        />
      )}
      {header.isGroup && (
        <ChatMembersModal
          isOpen={isMembersOpen}
          onClose={() => setIsMembersOpen(false)}
          roomId={roomId}
          isGroup={header.isGroup}
          currentUserId={user?.id ?? null}
          createdBy={createdBy}
          members={membersForModal}
          onRefreshMembers={async () => {
            const roster = await fetchMemberRoster()
            setMemberIds(roster.ids)
            setMemberDirectory(roster.directory)
            setMemberProfiles(roster.profiles)
          }}
        />
      )}
      </section>

      <section className="relative h-full min-h-0 bg-slate-50" aria-label="Dashboard widgets">
        <div className="h-full overflow-auto p-4">
          <div className="flex flex-col gap-4">
            {roomType === 'potluck' && (
              <div>
                <PotluckWidget
                  metadata={roomMetadata}
                  currentUserId={user?.id ?? null}
                  memberDirectory={memberDirectory}
                  memberProfiles={memberProfiles}
                  ownerIds={ownerIdSet}
                  onUpdate={async (newMeta) => handlePatchRoom({ metadata: newMeta })}
                  isExpanded={expandedWidget === 'potluck'}
                  onToggleExpand={() => handleToggleWidget('potluck')}
                />
              </div>
            )}

            <DashboardCard
              title="Location"
              isExpanded={expandedWidget === 'map'}
              onToggleExpand={() => handleToggleWidget('map')}
            >
              {hasLatLng ? (
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  <div className="aspect-video w-full relative">
                    <LocationMapPanel photo={mapPhoto} />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 border-t border-slate-200">
                    <MapPin className="h-3 w-3 text-slate-500" />
                    <span className="truncate">{addressLabel ?? 'Address pending'}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500 text-center">
                  Location map will appear once coordinates are added.
                </div>
              )}
            </DashboardCard>

            <DashboardCard
              title="Details"
              isExpanded={expandedWidget === 'details'}
              onToggleExpand={() => handleToggleWidget('details')}
            >
              <div className="space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Room</div>
                  <div className="text-sm font-semibold text-slate-900">{header.title}</div>
                  <div className="text-xs text-slate-500">Type: {roomType === 'potluck' ? 'Potluck' : 'General'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Members</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {memberDisplay.length > 0 ? (
                      memberDisplay.map((member) => (
                        <span
                          key={member.id}
                          className={
                            member.isOwner
                              ? 'inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs'
                              : 'inline-flex items-center rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-xs'
                          }
                        >
                          {member.label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">Members unavailable.</span>
                    )}
                  </div>
                </div>
                {createdBy && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Created by</div>
                    <div className="text-sm text-slate-700">{memberDirectory[createdBy] ?? 'Unknown'}</div>
                  </div>
                )}
              </div>
            </DashboardCard>
          </div>
        </div>

        {expandedWidget && (
          <div className="absolute inset-0 z-20 bg-slate-50/95 backdrop-blur-sm p-4">
            <div className="h-full overflow-auto">
              {expandedWidget === 'potluck' && roomType === 'potluck' && (
                <PotluckWidget
                  metadata={roomMetadata}
                  currentUserId={user?.id ?? null}
                  memberDirectory={memberDirectory}
                  memberProfiles={memberProfiles}
                  ownerIds={ownerIdSet}
                  onUpdate={async (newMeta) => handlePatchRoom({ metadata: newMeta })}
                  isExpanded
                  onToggleExpand={() => handleToggleWidget('potluck')}
                />
              )}
              {expandedWidget === 'map' && (
                <DashboardCard title="Location" isExpanded onToggleExpand={() => handleToggleWidget('map')}>
                  {hasLatLng ? (
                    <div className="rounded-xl overflow-hidden border border-slate-200">
                      <div className="aspect-video w-full relative">
                        <LocationMapPanel photo={mapPhoto} />
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 border-t border-slate-200">
                        <MapPin className="h-3 w-3 text-slate-500" />
                        <span className="truncate">{addressLabel ?? 'Address pending'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500 text-center">
                      Location map will appear once coordinates are added.
                    </div>
                  )}
                </DashboardCard>
              )}
              {expandedWidget === 'details' && (
                <DashboardCard title="Details" isExpanded onToggleExpand={() => handleToggleWidget('details')}>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Room</div>
                      <div className="text-sm font-semibold text-slate-900">{header.title}</div>
                      <div className="text-xs text-slate-500">
                        Type: {roomType === 'potluck' ? 'Potluck' : 'General'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Members</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {memberDisplay.length > 0 ? (
                          memberDisplay.map((member) => (
                            <span
                              key={member.id}
                              className={
                                member.isOwner
                                  ? 'inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs'
                                  : 'inline-flex items-center rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-xs'
                              }
                            >
                              {member.label}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">Members unavailable.</span>
                        )}
                      </div>
                    </div>
                    {createdBy && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">Created by</div>
                        <div className="text-sm text-slate-700">{memberDirectory[createdBy] ?? 'Unknown'}</div>
                      </div>
                    )}
                  </div>
                </DashboardCard>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
