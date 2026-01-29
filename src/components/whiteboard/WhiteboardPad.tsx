import { useEffect, useMemo, useRef } from 'react'
import { API_BASE_URL } from '../../api'
import { acquireWhiteboardTransport } from '../../realtime/whiteboardTransportRegistry'
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
  const transport = useMemo(
    () => acquireWhiteboardTransport({ apiBaseUrl: API_BASE_URL, boardId, getToken: () => tokenRef.current }),
    [boardId],
  )

  useEffect(() => () => transport.disconnect(), [transport])
  const sourceId = useMemo(() => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }, [])

  return (
    <div className={`flex h-full w-full flex-col ${className || ''}`}>
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
          transport={transport}
          mode="pad"
          sourceId={sourceId}
          className="h-full"
        />
      </div>
    </div>
  )
}
