import type { ChatMessage } from '../../types/chat'
import ChatPhotoAttachment from './ChatPhotoAttachment'

export interface ChatBubbleProps {
  message: ChatMessage
  roomId: string
  isOwn: boolean
  senderLabel: string
  timestampLabel: string
  isGroupedWithPrev?: boolean
  showSenderLabel?: boolean
  avatarUrl?: string | null
}

export default function ChatBubble({ message, roomId, isOwn, senderLabel, timestampLabel, isGroupedWithPrev = false, showSenderLabel = true, avatarUrl = null, }: ChatBubbleProps) {
  const senderLabelTrimmed = (senderLabel ?? '').trim()
  const isDeletedSender = message.sender_id == null || senderLabelTrimmed.length === 0
  const displaySenderLabel = isDeletedSender ? 'Deleted User' : senderLabelTrimmed
  const content = (message.content ?? '').trim()

  const bubbleBase = isOwn
    ? 'rounded-2xl bg-slate-900 text-white'
    : 'rounded-2xl bg-white border border-slate-200 text-slate-900'

  const topMargin = isGroupedWithPrev ? 'mt-1' : 'mt-4'

  return (
    <div className={`${topMargin} flex ${isOwn ? 'justify-end' : 'justify-start'}`} data-testid={`chat-bubble-${message.id}`}>
      {!isOwn && avatarUrl ? (
        <img src={avatarUrl} alt={senderLabelTrimmed || 'Avatar'} className="h-6 w-6 rounded-full mr-2 flex-shrink-0 object-cover" />
      ) : null}

      <div
        className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 ${bubbleBase}`}
        style={{ lineHeight: 1.5 }}
      >
        <div className={`flex items-start justify-between gap-3 ${isOwn ? 'text-slate-200' : 'text-slate-500'}`}>
          <div className="min-w-0">
            {showSenderLabel && !isOwn ? (
              <div className={`text-xs font-medium truncate ${isDeletedSender ? 'italic' : ''} text-slate-600`}> 
                {displaySenderLabel}
                {isDeletedSender ? <span className="ml-1 text-[10px] font-normal opacity-80">(deleted)</span> : null}
              </div>
            ) : null}
          </div>
          <div className="ml-3 flex-shrink-0">
            <span className="text-[11px] text-slate-400 whitespace-nowrap">{timestampLabel}</span>
          </div>
        </div>

        {content ? (
          <p className={`mt-2 text-sm leading-7 whitespace-pre-wrap break-words ${isOwn ? 'text-white' : 'text-slate-800'}`}>
            {message.content}
          </p>
        ) : null}

        {typeof message.photo_id === 'string' ? <ChatPhotoAttachment roomId={roomId} photoId={message.photo_id} /> : null}
      </div>
    </div>
  )
}
