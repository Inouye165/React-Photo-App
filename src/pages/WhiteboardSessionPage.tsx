import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import WhiteboardPad from '../components/whiteboard/WhiteboardPad'

export default function WhiteboardSessionPage(): React.JSX.Element {
  const { boardId } = useParams()
  const navigate = useNavigate()

  if (!boardId) return <div>Missing board id</div>

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
        <WhiteboardPad boardId={boardId} className="h-full" />
      </div>
    </div>
  )
}
