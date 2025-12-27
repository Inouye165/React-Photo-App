import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import ChatSidebar from '../components/chat/ChatSidebar'
import ChatWindow from '../components/chat/ChatWindow'

export default function ChatPage() {
  const navigate = useNavigate()
  const params = useParams()
  const roomId = typeof params.roomId === 'string' ? params.roomId : null

  const [drawerOpen, setDrawerOpen] = useState(false)

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

  return (
    <div className="relative flex flex-col sm:flex-row h-[calc(100vh-88px)]" data-testid="chat-page">
      <div className={`${roomId ? 'hidden sm:block' : 'block'} w-full sm:w-auto`}>
        <ChatSidebar selectedRoomId={roomId} onSelectRoom={onSelectRoom} />
      </div>

      <div className={`${roomId ? 'block' : 'hidden sm:block'} flex-1`}>
        <ChatWindow roomId={roomId} onOpenSidebar={openDrawer} />
      </div>

      {drawerOpen && roomId && (
        <div className="sm:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Chat rooms">
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
