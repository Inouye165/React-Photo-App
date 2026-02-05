import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import WhiteboardPad from '../components/whiteboard/WhiteboardPad'

export default function ChatPadPage() {
  const params = useParams()
  const navigate = useNavigate()
  const roomId = typeof params.roomId === 'string' ? params.roomId : ''

  const padContent = useMemo(() => {
    if (!roomId) {
      return (
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
          Room not found.
        </div>
      )
    }

    return <WhiteboardPad boardId={roomId} className="h-full" />
  }, [roomId])

  return (
    <div className="fixed inset-0 bg-white">
      <div className="mx-auto flex h-full w-full max-w-full flex-col" style={{ maxWidth: '100%', margin: '0 auto' }}>
        <div className="flex items-center justify-between border-b border-slate-100 px-3 pb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              onClick={() => navigate('/chat')}
            >
              ← Back
            </button>
            <div className="text-sm font-bold text-slate-900">Whiteboard Pad</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="text-xs text-slate-400">Live Session</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{padContent}</div>
      </div>
    </div>
  )
}
