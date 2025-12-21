import type { ChatMessage } from '../../types/chat'

export interface ChatBubbleProps {
  message: ChatMessage
  isOwn: boolean
  senderLabel: string
  timestampLabel: string
}

export default function ChatBubble({ message, isOwn, senderLabel, timestampLabel }: ChatBubbleProps) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`} data-testid={`chat-bubble-${message.id}`}>
      <div
        className={
          isOwn
            ? 'max-w-[80%] rounded-2xl bg-slate-900 text-white px-4 py-3'
            : 'max-w-[80%] rounded-2xl bg-white border border-slate-200 text-slate-900 px-4 py-3'
        }
      >
        <div className={`flex items-center justify-between gap-3 ${isOwn ? 'text-slate-200' : 'text-slate-500'}`}>
          <span className="text-xs font-medium truncate">{senderLabel}</span>
          <span className="text-[11px] whitespace-nowrap">{timestampLabel}</span>
        </div>
        <p className={`mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${isOwn ? 'text-white' : 'text-slate-800'}`}>
          {message.content}
        </p>
      </div>
    </div>
  )
}
