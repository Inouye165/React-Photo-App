import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import ChatSidebar from '../components/chat/ChatSidebar'
import ChatWindow from '../components/chat/ChatWindow'
import { useAuth } from '../contexts/AuthContext'

export default function ChatPage() {
  const navigate = useNavigate()
  const params = useParams()
  const roomId = typeof params.roomId === 'string' ? params.roomId : null
  const { user } = useAuth()
  const prevUserIdRef = useRef<string | null>(user?.id ?? null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isChatCollapsed, setIsChatCollapsed] = useState(false)

  useEffect(() => {
    if (!drawerOpen) return

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        setDrawerOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [drawerOpen])

  useEffect(() => {
    const nextUserId = user?.id ?? null
    if (prevUserIdRef.current !== nextUserId) {
      prevUserIdRef.current = nextUserId
      navigate('/chat', { replace: true })
    }
  }, [navigate, user?.id])

  const onSelectRoom = useCallback(
    (nextRoomId: string) => {
      setDrawerOpen(false)
      navigate(`/chat/${nextRoomId}`)
    },
    [navigate],
  )

  const openDrawer = useCallback(() => {
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
  }, [])

  const gridColumns = isChatCollapsed
    ? 'lg:grid-cols-[60px_minmax(0,1fr)]'
    : 'lg:grid-cols-[minmax(320px,480px)_minmax(0,1fr)]'

  return (
    <div
      className={`relative grid h-screen overflow-hidden grid-cols-1 ${gridColumns} bg-slate-100`}
      data-testid="chat-page"
    >
      <ChatWindow
        key={user?.id ?? 'anon'}
        roomId={roomId}
        onOpenSidebar={openDrawer}
        isChatCollapsed={isChatCollapsed}
        onToggleCollapse={() => setIsChatCollapsed((prev) => !prev)}
      />

      {drawerOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Chat rooms">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={closeDrawer}
            aria-label="Close chat drawer"
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85%]">
            <ChatSidebar selectedRoomId={roomId} onSelectRoom={onSelectRoom} />
          </div>
        </div>
      )}
    </div>
  )
}
