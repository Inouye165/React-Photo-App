import { useEffect, useMemo, useRef, useState } from 'react'

import { sendMessage } from '../../api'
import { useChatRealtime } from '../../hooks/useChatRealtime'
import { supabase } from '../../supabaseClient'
import type { ChatMessage } from '../../types/chat'
import { useAuth } from '../../contexts/AuthContext'
import ChatBubble from './ChatBubble'

export interface ChatWindowProps {
  roomId: string | null
}

type UserRow = { id: string; username: string | null }

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatWindow({ roomId }: ChatWindowProps) {
  const { user, profile } = useAuth()
  const { messages, loading, error } = useChatRealtime(roomId)

  const [draft, setDraft] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [idToUsername, setIdToUsername] = useState<Record<string, string | null>>({})

  const bottomRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    // Auto-scroll on new messages (and when switching rooms)
    try {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    } catch {
      bottomRef.current?.scrollIntoView()
    }
  }, [roomId, messages.length])

  useEffect(() => {
    setDraft('')
    setSendError(null)
    setSending(false)
  }, [roomId])

  const canSend = Boolean(roomId) && !sending

  async function onSend(): Promise<void> {
    if (!roomId) return
    const trimmed = draft.trim()
    if (!trimmed) return

    try {
      setSending(true)
      setSendError(null)
      await sendMessage(roomId, trimmed)
      setDraft('')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSendError(message)
    } finally {
      setSending(false)
    }
  }

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
    <section className="flex-1 flex flex-col bg-slate-50" aria-label="Chat window">
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-3" data-testid="chat-messages">
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
              isOwn={isOwn}
              senderLabel={getSenderLabel(m)}
              timestampLabel={formatTime(m.created_at)}
            />
          )
        })}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
        {sendError && <div className="mb-2 text-sm text-red-600">{sendError}</div>}

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSend()
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="submit"
            disabled={!canSend || !draft.trim()}
            className={
              !canSend || !draft.trim()
                ? 'px-4 py-3 rounded-2xl bg-slate-200 text-slate-500 text-sm font-semibold cursor-not-allowed'
                : 'px-4 py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800'
            }
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </div>
    </section>
  )
}
