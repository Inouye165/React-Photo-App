import { useEffect, useRef } from 'react'
import WhiteboardCanvas from './WhiteboardCanvas'
import { useRealtimeToken } from '../../hooks/useRealtimeToken'

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
  if (status === 'error') {
    return (
      <div className={`flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500 ${className || ''}`}>
        Unable to authenticate whiteboard session.
      </div>
    )
  }

  return (
    <WhiteboardCanvas
      boardId={boardId}
      token={token}
      mode="viewer"
      className={className}
    />
  )
}
