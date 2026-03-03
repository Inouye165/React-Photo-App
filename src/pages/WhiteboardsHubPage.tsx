import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMyWhiteboards, createWhiteboard, deleteWhiteboard, leaveWhiteboard } from '../api/whiteboards'
import type { WhiteboardHubItem } from '../types/whiteboard'
import { useAuth } from '../contexts/AuthContext'
import useStore from '../store'

export default function WhiteboardsHubPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  const setToast = useStore.getState().setToast
  const [boards, setBoards] = useState<WhiteboardHubItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createError, setCreateError] = useState<string | null>(null)
  const [inflight, setInflight] = useState<Record<string, { deleting?: boolean; leaving?: boolean }>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listMyWhiteboards()
        if (cancelled) return
        // Ensure newest first by updated_at or created_at
        rows.sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at))
        setBoards(rows)
      } catch (err) {
        if (!cancelled) console.warn('[WB-HUB] load failed', { message: err instanceof Error ? err.message : String(err) })
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

  const handleDelete = useCallback(async (boardId: string) => {
    const ok = window.confirm('Delete this whiteboard and all its data? This cannot be undone.')
    if (!ok) return
    setInflight((s) => ({ ...s, [boardId]: { ...(s[boardId] || {}), deleting: true } }))
    // optimistic update
    const prev = boards
    setBoards((rows) => rows.filter((r) => r.id !== boardId))
    try {
      await deleteWhiteboard(boardId)
      setToast({ message: 'Whiteboard deleted', severity: 'success' })
    } catch (err) {
      // rollback
      setBoards(prev)
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', severity: 'error' })
    } finally {
      setInflight((s) => ({ ...s, [boardId]: { ...(s[boardId] || {}), deleting: false } }))
    }
  }, [boards, setToast])

  const handleLeave = useCallback(async (boardId: string) => {
    const ok = window.confirm('Leave this whiteboard? You will lose access.')
    if (!ok) return
    setInflight((s) => ({ ...s, [boardId]: { ...(s[boardId] || {}), leaving: true } }))
    const prev = boards
    setBoards((rows) => rows.filter((r) => r.id !== boardId))
    try {
      await leaveWhiteboard(boardId)
      setToast({ message: 'Left whiteboard', severity: 'success' })
    } catch (err) {
      setBoards(prev)
      setToast({ message: err instanceof Error ? err.message : 'Failed to leave', severity: 'error' })
    } finally {
      setInflight((s) => ({ ...s, [boardId]: { ...(s[boardId] || {}), leaving: false } }))
    }
  }, [boards, setToast])

  return (
    <main className="h-[100dvh] p-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Whiteboards</h1>
          <button onClick={handleCreate} className="rounded bg-slate-900 px-3 py-2 text-white">Create Whiteboard</button>
        </div>

        <div className="mt-4">
          {createError && <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</div>}
          {loading && <div>Loading…</div>}
          {!loading && boards.length === 0 && <div>No whiteboards yet.</div>}
          {!loading && boards.length > 0 && (
            <ul className="space-y-2 mt-2">
              {boards.map((b) => (
                <li key={b.id} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-semibold truncate">{b.name ?? 'Whiteboard'}</div>
                        <div className="text-xs text-slate-500">{new Date(b.updated_at || b.created_at).toLocaleString()}</div>
                        {b.owner && (
                          <div className="text-sm text-slate-700 mt-1">Owner: <span className="font-medium">{b.owner.username ?? b.owner.id}</span></div>
                        )}
                      </div>
                      <div className="flex items-center -space-x-2 ml-2" aria-hidden>
                        {b.participants.filter((p) => p.id !== b.owner?.id).slice(0, 5).map((p) => (
                          <div key={p.id} className="h-6 w-6 rounded-full ring-2 ring-white overflow-hidden bg-slate-100" title={p.username ?? undefined}>
                            {p.avatar_url ? <img src={p.avatar_url} alt={p.username ?? 'participant'} className="h-6 w-6 object-cover"/> : <div className="h-6 w-6 flex items-center justify-center text-xs text-slate-600">{(p.username || p.id || '').slice(0,2).toUpperCase()}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigate(`/whiteboards/${b.id}`)} className="rounded bg-slate-100 px-2 py-1 text-sm">Open</button>
                      {currentUserId && b.owner && currentUserId === b.owner.id ? (
                        <>
                          <button
                            onClick={() => handleLeave(b.id)}
                            disabled={Boolean(inflight[b.id]?.leaving)}
                            aria-label={`Leave ${b.name ?? 'whiteboard'}`}
                            className="rounded border px-2 py-1 text-sm"
                          >
                            {inflight[b.id]?.leaving ? 'Leaving…' : 'Leave'}
                          </button>
                          <button
                            onClick={() => handleDelete(b.id)}
                            disabled={Boolean(inflight[b.id]?.deleting)}
                            aria-label={`Delete ${b.name ?? 'whiteboard'}`}
                            className="rounded bg-rose-600 px-2 py-1 text-sm text-white"
                          >
                            {inflight[b.id]?.deleting ? 'Deleting…' : 'Delete'}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleLeave(b.id)}
                          disabled={Boolean(inflight[b.id]?.leaving)}
                          aria-label={`Leave ${b.name ?? 'whiteboard'}`}
                          className="rounded border px-2 py-1 text-sm"
                        >
                          {inflight[b.id]?.leaving ? 'Leaving…' : 'Leave'}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
