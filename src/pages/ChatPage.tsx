import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import ChatSidebar from '../components/chat/ChatSidebar'
import ChatWindow from '../components/chat/ChatWindow'

export default function ChatPage() {
  const navigate = useNavigate()
  const params = useParams()
  const roomId = typeof params.roomId === 'string' ? params.roomId : null

  const onSelectRoom = useCallback(
    (nextRoomId: string) => {
      navigate(`/chat/${nextRoomId}`)
    },
    [navigate],
  )

  return (
    <div className="flex flex-col sm:flex-row h-[calc(100vh-88px)]" data-testid="chat-page">
      <ChatSidebar selectedRoomId={roomId} onSelectRoom={onSelectRoom} />
      <ChatWindow roomId={roomId} />
    </div>
  )
}
