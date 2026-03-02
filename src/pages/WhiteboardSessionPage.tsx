import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import WhiteboardPad from '../components/whiteboard/WhiteboardPad'
import { ensureWhiteboardMembership } from '../api/whiteboards'

export default function WhiteboardSessionPage(): React.JSX.Element {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking')

  if (!boardId) return <div>Missing board id</div>

  useEffect(() => {
    let cancelled = false
    setAccessState('checking')

    ;(async () => {
      const result = await ensureWhiteboardMembership(boardId)
      if (cancelled) return
      setAccessState(result.ok ? 'allowed' : 'denied')
    })()

    return () => {
      cancelled = true
    }
  }, [boardId])

  if (accessState === 'checking') {
    return (
      <div className="h-[100dvh] w-full bg-white p-4">
        <div className="mx-auto max-w-3xl">
          <button onClick={() => navigate('/whiteboards')} className="rounded border px-2 py-1">Back</button>
          <div className="mt-4 text-slate-700">Checking whiteboard access…</div>
        </div>
      </div>
    )
  }

  if (accessState === 'denied') {
    return (
      <div className="h-[100dvh] w-full bg-white p-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-lg font-semibold">No access</h2>
          <p className="mt-2 text-slate-700">You don’t have access to this whiteboard yet.</p>
          <button onClick={() => navigate('/whiteboards')} className="mt-4 rounded border px-3 py-2">Back to Whiteboards</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full bg-white">
      <div className="flex items-center gap-3 border-b p-3">
        <button onClick={() => navigate('/whiteboards')} className="rounded border px-2 py-1">Back</button>
        <h2 className="text-lg font-semibold">Whiteboard</h2>
        <div className="ml-auto">
          <button
            onClick={() => {
              try {
                void navigator.clipboard.writeText(window.location.href)
              } catch {
                // ignore
              }
            }}
            className="rounded border px-2 py-1"
          >
            Copy link
          </button>
        </div>
      </div>

      <div className="h-[calc(100dvh-56px)]">
        <WhiteboardPad
          boardId={boardId}
          className="h-full"
          onAccessDenied={() => {
            setAccessState('denied')
          }}
        />
      </div>
    </div>
  )
}
