import React from 'react'
import type { WhiteboardTutorMessage } from '../../../types/whiteboard'

export interface ChatTabProps {
  className?: string
  hasPhoto: boolean
  messages: WhiteboardTutorMessage[]
  draft: string
  isSubmitting: boolean
  onDraftChange: (value: string) => void
  onSubmit: () => void
}

const ChatTab: React.FC<ChatTabProps> = ({
  className = '',
  hasPhoto,
  messages,
  draft,
  isSubmitting,
  onDraftChange,
  onSubmit,
}) => {
  return (
    <div className={`flex h-full flex-col bg-[#161b22] text-white ${className}`}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {!hasPhoto ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
            Import a photo to chat with the AI about the work on the board.
          </div>
        ) : null}

        {hasPhoto && messages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            The chat will be pre-seeded from the photo analysis and keep the full conversation in this session.
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.role === 'assistant'
                ? 'border border-white/10 bg-white/[0.04] text-slate-100'
                : 'ml-8 bg-amber-500 text-slate-950'
            }`}
          >
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
              {message.role === 'assistant' ? 'AI Tutor' : 'You'}
            </div>
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
            disabled={!hasPhoto || isSubmitting}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400"
            placeholder={hasPhoto ? 'Ask anything about the whiteboard content' : 'Import a photo first'}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={!hasPhoto || isSubmitting || !draft.trim()}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            {isSubmitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatTab
