import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMyWhiteboards, createWhiteboard } from '../api/whiteboards'
import { listRoomMembers, RoomMemberDetails } from '../api/chat'
import Avatar from '../components/Avatar'
import { useAuth } from '../contexts/AuthContext'
import type { ChatRoom } from '../types/chat'

export default function WhiteboardsHubPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [boards, setBoards] = useState<ChatRoom[]>([])
  const [membersByBoard, setMembersByBoard] = useState<Record<string, RoomMemberDetails[]>>({})
  const { profile } = useAuth()

  // Use shared Avatar component for consistent behavior
  const [loading, setLoading] = useState(true)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listMyWhiteboards()
        if (cancelled) return
        setBoards(rows)
        // fetch members for whiteboards (non-blocking)
        void (async () => {
          const map: Record<string, RoomMemberDetails[]> = {}
          await Promise.all(
            rows.map(async (r) => {
              try {
                const m = await listRoomMembers(r.id)
                if (cancelled) return
                map[r.id] = m
              } catch {
                // ignore per-board member load failures
              }
            }),
          )
          if (cancelled) return
          setMembersByBoard(map)
        })()
      } catch {
        if (cancelled) return
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate() {
    setCreateError(null)
    try {
      const room = await createWhiteboard()
      navigate(`/whiteboards/${room.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create whiteboard'
      setCreateError(message)
    }
  }

  return (
    <main className="h-[100dvh] p-6 bg-slate-50">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              aria-label="Go home"
              className="rounded border px-3 py-2 text-sm hover:bg-slate-100"
            >
              Home
            </button>
            <h1 className="text-2xl font-semibold">Whiteboards</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCreate} className="rounded bg-slate-900 px-3 py-2 text-white">Create Whiteboard</button>
          </div>
        </div>

        <div className="mt-2">
          {createError && (
            <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</div>
          )}

          <div className="rounded-lg border bg-white p-4 shadow-sm">
            {loading && <div className="text-sm text-slate-600">Loading…</div>}
            {!loading && boards.length === 0 && (
              <div className="text-sm text-slate-700">No whiteboards yet. Click "Create Whiteboard" to start one.</div>
            )}

            {!loading && boards.length > 0 && (
              <ul className="mt-2 grid gap-3 sm:grid-cols-1">
                {boards.map((b) => (
                  <li key={b.id} className="flex items-center justify-between rounded-md border px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate text-slate-900">{b.name ?? 'Whiteboard'}</div>
                      <div className="text-xs text-slate-500 mt-1">{new Date(b.created_at).toLocaleString()}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      {membersByBoard[b.id] && membersByBoard[b.id].length > 0 ? (
                        <div className="flex items-center gap-2">
                          {membersByBoard[b.id].slice(0, 4).map((m) => (
                            <div key={m.user_id} title={m.username ?? undefined}>
                              <Avatar
                                src={m.avatar_url ?? (profile?.id === m.user_id ? profile?.avatar_url ?? undefined : undefined)}
                                username={m.username ?? null}
                                size={48}
                              />
                            </div>
                          ))}
                          {membersByBoard[b.id].length > 4 ? (
                            <div className="text-sm text-slate-500">+{membersByBoard[b.id].length - 4}</div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">No members</div>
                      )}

                      <div className="flex-shrink-0">
                        <button onClick={() => navigate(`/whiteboards/${b.id}`)} className="rounded bg-slate-800 px-3 py-1 text-sm text-white">Open</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
