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
    <div
      className="relative grid h-full min-h-0 overflow-hidden grid-cols-1 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]"
      data-testid="chat-page"
    >
      <ChatSidebar
        selectedRoomId={roomId}
        onSelectRoom={onSelectRoom}
        showIdentityGate={isJoiningRoom}
      />
      <ChatWindow
        key={user?.id ?? 'anon'}
        roomId={roomId}
        showIdentityGate={isJoiningRoom}
        mode="workspace"
      />
    </div>
  )
}
