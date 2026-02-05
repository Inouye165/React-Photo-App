import { useEffect, useRef } from 'react'
import { useRealtimeToken } from '../../hooks/useRealtimeToken'
import WhiteboardCanvas from './WhiteboardCanvas'

type WhiteboardPadProps = {
  boardId: string
  className?: string
}

export default function WhiteboardPad({ boardId, className }: WhiteboardPadProps) {
  const { token, status } = useRealtimeToken()
  const tokenRef = useRef(token)
  useEffect(() => {
    tokenRef.current = token
  }, [token])
  return (
    <div className={`mx-auto flex h-full w-full max-w-full flex-col ${className || ''}`} style={{ maxWidth: '100%', margin: '0 auto' }}>
      <div className="flex items-center justify-between pb-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Pad Mode</div>
          <div className="text-xs text-slate-500">Draw with touch or mouse.</div>
        </div>
        <div className="text-xs text-slate-500">
          {status === 'ready' ? 'Ready' : status === 'error' ? 'Auth required' : 'Authorizing…'}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <WhiteboardCanvas
          boardId={boardId}
          token={token}
          mode="pad"
          className="h-full"
        />
      </div>
    </div>
  )
}
