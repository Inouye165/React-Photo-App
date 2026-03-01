import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import ChatSidebar from '../components/chat/ChatSidebar'
import ChatWindow from '../components/chat/ChatWindow'
import { useAuth } from '../contexts/AuthContext'

export default function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const roomId = typeof params.roomId === 'string' ? params.roomId : null
  const { user } = useAuth()
  const prevUserIdRef = useRef<string | null>(user?.id ?? null)

  useEffect(() => {
    const nextUserId = user?.id ?? null
    if (prevUserIdRef.current !== nextUserId) {
      prevUserIdRef.current = nextUserId
      navigate('/chat', { replace: true })
    }
  }, [navigate, user?.id])

  const onSelectRoom = useCallback(
    (nextRoomId: string) => {
      navigate(`/chat/${nextRoomId}`)
    },
    [navigate],
  )

  const isJoiningRoom = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return Boolean(params.get('code'))
  }, [location.search])

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden" data-testid="chat-page">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          {roomId ? (
            <button
              type="button"
              onClick={() => navigate('/chat')}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Rooms
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Home
          </button>
        </div>
        <div className="text-xs font-medium text-slate-500">Messages</div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Sidebar: hidden on small screens when a room is open; visible on lg+ always */}
        <div className={roomId ? 'hidden lg:block h-full min-h-0' : 'block lg:block h-full min-h-0'}>
          <ChatSidebar
            selectedRoomId={roomId}
            onSelectRoom={onSelectRoom}
            showIdentityGate={isJoiningRoom}
          />
        </div>

        {/* ChatWindow: workspace on lg+; on small screens show conversation only when roomId present */}
        <div className="hidden lg:block h-full min-h-0">
          <ChatWindow
            key={user?.id ?? 'anon'}
            roomId={roomId}
            showIdentityGate={isJoiningRoom}
            mode={roomId ? 'conversation' : 'workspace'}
          />
        </div>

        <div className={roomId ? 'block lg:hidden h-full min-h-0' : 'hidden'}>
          <ChatWindow
            key={`conv-${user?.id ?? 'anon'}`}
            roomId={roomId}
            showIdentityGate={isJoiningRoom}
            mode="conversation"
          />
        </div>
      </div>
    </div>
  )
}
