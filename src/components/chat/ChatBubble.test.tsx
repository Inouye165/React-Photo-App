import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../AuthenticatedImage', () => {
  return {
    default: ({ alt, src, className }: { alt: string; src: string; className?: string }) => (
      <img alt={alt} src={src} className={className} />
    ),
  }
})

import ChatBubble from './ChatBubble'

describe('ChatBubble', () => {
  it('renders ChatPhotoAttachment when message has photo_id', () => {
    render(
      <ChatBubble
        roomId="room-1"
        isOwn={false}
        senderLabel="Someone"
        timestampLabel="12:00"
        message={{
          id: 1,
          room_id: 'room-1',
          sender_id: '11111111-1111-4111-8111-111111111111',
          content: '',
          photo_id: 42,
          created_at: new Date().toISOString(),
        }}
      />,
    )

    expect(screen.getByAltText('Shared photo')).toBeInTheDocument()
  })
})
