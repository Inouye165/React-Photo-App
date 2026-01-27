export type ChatRoomType = 'general' | 'potluck' | 'collaboration'

export type PotluckItem = {
  id: string
  label: string
  claimedByUserId: string | null
}

export type PotluckHostNotes = {
  message: string
  instructions?: string
  createdAt: string
  createdByUserId?: string | null
}

export type PotluckAllergy = {
  id: string
  label: string
  addedByUserId: string | null
  createdAt: string
}

export type PotluckData = {
  location?: {
    address: string
    lat?: number | null
    lng?: number | null
  }
  items: PotluckItem[]
  hostNotes?: PotluckHostNotes
  allergies?: PotluckAllergy[]
}

export type ChatRoomMetadata = {
  potluck?: PotluckData
  [key: string]: unknown
}

export interface ChatRoom {
  id: string
  name: string | null
  is_group: boolean
  created_at: string
  created_by?: string | null
  type: ChatRoomType
  metadata: ChatRoomMetadata
}

export interface RoomMember {
  room_id: string
  user_id: string
  is_owner?: boolean
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
