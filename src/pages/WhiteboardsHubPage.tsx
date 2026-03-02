import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMyWhiteboards, createWhiteboard } from '../api/whiteboards'
import type { ChatRoom } from '../types/chat'

export default function WhiteboardsHubPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [boards, setBoards] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listMyWhiteboards()
        if (cancelled) return
        setBoards(rows)
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
    const room = await createWhiteboard()
    navigate(`/whiteboards/${room.id}`)
  }

  return (
    <main className="h-[100dvh] p-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Whiteboards</h1>
          <button onClick={handleCreate} className="rounded bg-slate-900 px-3 py-2 text-white">Create Whiteboard</button>
        </div>

        <div className="mt-4">
          {loading && <div>Loading…</div>}
          {!loading && boards.length === 0 && <div>No whiteboards yet.</div>}
          {!loading && boards.length > 0 && (
            <ul className="space-y-2 mt-2">
              {boards.map((b) => (
                <li key={b.id} className="rounded border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold truncate">{b.name ?? 'Whiteboard'}</div>
                      <div className="text-xs text-slate-500">{new Date(b.created_at).toLocaleString()}</div>
                    </div>
                    <div>
                      <button onClick={() => navigate(`/whiteboards/${b.id}`)} className="rounded bg-slate-100 px-2 py-1 text-sm">Open</button>
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
