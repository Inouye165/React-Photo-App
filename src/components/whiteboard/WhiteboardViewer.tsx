import { useEffect, useMemo, useRef } from 'react'
import { API_BASE_URL } from '../../api'
import { acquireWhiteboardTransport } from '../../realtime/whiteboardTransportRegistry'
import { useRealtimeToken } from '../../hooks/useRealtimeToken'
import WhiteboardCanvas from './WhiteboardCanvas'
import WhiteboardOverlayToolbar from './WhiteboardOverlayToolbar'

type WhiteboardViewerProps = {
  boardId: string
  className?: string
}

export default function WhiteboardViewer({ boardId, className }: WhiteboardViewerProps) {
  const { token, status } = useRealtimeToken()
  const tokenRef = useRef(token)
  useEffect(() => {
    tokenRef.current = token
  }, [token])
  const transport = useMemo(
    () => acquireWhiteboardTransport({ apiBaseUrl: API_BASE_URL, boardId, getToken: () => tokenRef.current }),
    [boardId],
  )

  useEffect(() => () => transport.disconnect(), [transport])

  if (status === 'error') {
    return (
      <div className={`flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500 ${className || ''}`}>
        Unable to authenticate whiteboard session.
      </div>
    )
  }

  return (
    <WhiteboardOverlayToolbar boardId={boardId} className={className}>
      <WhiteboardCanvas
        boardId={boardId}
        token={token}
        transport={transport}
        mode="viewer"
        className="h-full"
      />
    </WhiteboardOverlayToolbar>
  )
}
