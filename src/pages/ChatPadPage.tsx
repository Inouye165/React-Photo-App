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
    <div className="fixed inset-0 bg-slate-100 p-4">
      <div className="flex h-full w-full flex-col rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <button
            type="button"
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            onClick={() => navigate('/chat')}
          >
            ← Back to chat
          </button>
        </div>
        <div className="flex-1 min-h-0">{padContent}</div>
      </div>
    </div>
  )
}
