import { useEffect, useMemo, useRef, useState } from 'react'

import { ArrowDown, Image as ImageIcon, X } from 'lucide-react'

import { API_BASE_URL, getAccessToken, getPhotos, sendMessage } from '../../api'
import { useChatRealtime } from '../../hooks/useChatRealtime'
import { usePresence } from '../../hooks/usePresence'
import { useChatTyping } from '../../hooks/useChatTyping'
import { supabase } from '../../supabaseClient'
import type { ChatMessage } from '../../types/chat'
import { useAuth } from '../../contexts/AuthContext'
import { toUrl } from '../../utils/toUrl'
import AuthenticatedImage from '../AuthenticatedImage'
import ChatBubble from './ChatBubble'

export interface ChatWindowProps {
  roomId: string | null
}

type UserRow = { id: string; username: string | null }
type RoomRow = { id: string; name: string | null; is_group: boolean | null }

type ChatHeaderState = {
  title: string
  isGroup: boolean
  otherUserId: string | null
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatWindow({ roomId }: ChatWindowProps) {
  const { user, profile } = useAuth()
  const { messages, loading, error } = useChatRealtime(roomId)
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

  const [idToUsername, setIdToUsername] = useState<Record<string, string | null>>({})
  const [header, setHeader] = useState<ChatHeaderState>({ title: 'Conversation', isGroup: false, otherUserId: null })

  // Typing indicator hook (best-effort; no UI crash if Realtime unavailable)
  const { typingUsernames, handleInputChange, handleInputSubmit } = useChatTyping({
    roomId: roomId ?? '',
    userId: user?.id ?? '',
    supabase,
    participants: Object.entries(idToUsername).map(([id, username]) => ({
      userId: id,
      username: username ?? undefined,
    })),
  })

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const prevMessageCountRef = useRef<number>(0)
  
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true)
  const [unseenCount, setUnseenCount] = useState<number>(0)

  const senderIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of messages) ids.add(m.sender_id)
    return [...ids]
  }, [messages])

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      if (!senderIds.length) {
        setIdToUsername({})
        return
      }

      const { data, error: usersError } = await supabase.from('users').select('id, username').in('id', senderIds)
      if (usersError) throw usersError

      const next: Record<string, string | null> = {}
      for (const row of (data ?? []) as UserRow[]) {
        if (typeof row.id !== 'string') continue
        next[row.id] = typeof row.username === 'string' ? row.username : null
      }

      if (!cancelled) setIdToUsername(next)
    }

    run().catch((err) => {
      if (import.meta.env.DEV) console.debug('[ChatWindow] Failed to resolve usernames:', err)
    })

    return () => {
      cancelled = true
    }
  }, [senderIds])

  // Mark room as read when opening
  useEffect(() => {
    if (!roomId || !user?.id) return

    const markRead = async () => {
      try {
        await supabase
          .from('room_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('room_id', roomId)
          .eq('user_id', user.id)
      } catch (err) {
        if (import.meta.env.DEV) console.error('[ChatWindow] Failed to mark read:', err)
      }
    }

    markRead()
  }, [roomId, user?.id])

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      if (!roomId) {
        setHeader({ title: 'Conversation', isGroup: false, otherUserId: null })
        return
      }

      setHeader({ title: 'Conversation', isGroup: false, otherUserId: null })

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id, name, is_group')
        .eq('id', roomId)
        .maybeSingle()

      if (roomError) throw roomError

      const roomRow = (room ?? null) as RoomRow | null
      const isGroup = Boolean(roomRow?.is_group)
      const roomName = typeof roomRow?.name === 'string' ? roomRow?.name : null

      if (isGroup) {
        if (!cancelled) setHeader({ title: roomName?.trim() || 'Group chat', isGroup: true, otherUserId: null })
        return
      }

      if (!user?.id) {
        if (!cancelled) setHeader({ title: roomName?.trim() || 'Direct message', isGroup: false, otherUserId: null })
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

  useEffect(() => {
    setDraft('')
    setSendError(null)
    setSending(false)
    setPickerOpen(false)
    setPickerError(null)
    setPickerLoading(false)
    setPickerPhotos([])
    setSelectedPhotoId(null)
    setUnseenCount(0)
    setIsAtBottom(true)
    prevMessageCountRef.current = 0
  }, [roomId])

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
    return idToUsername[message.sender_id]?.trim() || 'Unknown'
  }

  if (!roomId) {
    return (
      <section className="flex-1 flex items-center justify-center p-6 bg-slate-50" aria-label="Chat window">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-slate-900">Select a conversation</h2>
          <p className="mt-2 text-sm text-slate-600">Choose a room on the left to start chatting.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex-1 flex flex-col bg-slate-50 relative" aria-label="Chat window">
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 min-w-0">
          {!header.isGroup && header.otherUserId && isUserOnline(header.otherUserId) && (
            <div className="h-2 w-2 rounded-full bg-green-500" aria-label="Online" />
          )}
          <h2 className="text-sm font-semibold text-slate-900 truncate">{header.title}</h2>
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
            disabled={!roomId || sending}
            onClick={() => {
              // Keep token warm so fetches that require Authorization can work immediately.
              // (Picker thumbnails are usually signed and don't need this, but it's safe.)
              void getAccessToken()
              setPickerOpen((v) => {
                const next = !v
                if (!next) {
                  setPickerLoading(false)
                }
                return next
              })
            }}
            className={
              !roomId || sending
                ? 'inline-flex items-center justify-center h-10 w-10 rounded-2xl bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'inline-flex items-center justify-center h-10 w-10 rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200'
            }
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
    </section>
  )
}
