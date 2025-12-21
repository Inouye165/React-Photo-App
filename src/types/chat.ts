export interface ChatRoom {
  id: string
  name: string | null
  is_group: boolean
  created_at: string
}

export interface RoomMember {
  room_id: string
  user_id: string
}

export type MessageId = number

export interface ChatMessage {
  id: MessageId
  room_id: string
  sender_id: string
  content: string
  photo_id: number | null
  created_at: string
}
