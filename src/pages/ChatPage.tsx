import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

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

  const gridColumns = isSidebarCollapsed
    ? 'lg:grid-cols-[60px_minmax(0,1fr)]'
    : 'lg:grid-cols-[minmax(320px,480px)_minmax(0,1fr)]'

  const isJoiningRoom = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return Boolean(params.get('code'))
  }, [location.search])

  return (
    <div
      className={`relative grid h-screen overflow-hidden grid-cols-1 ${gridColumns} bg-slate-100`}
      data-testid="chat-page"
    >
      <ChatSidebar
        selectedRoomId={roomId}
        onSelectRoom={onSelectRoom}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <ChatWindow
        key={user?.id ?? 'anon'}
        roomId={roomId}
        showIdentityGate={isJoiningRoom}
      />
    </div>
  )
}
