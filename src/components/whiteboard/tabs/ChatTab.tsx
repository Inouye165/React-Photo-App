import React from 'react'
import { SendHorizonal } from 'lucide-react'
import type { WhiteboardTutorMessage } from '../../../types/whiteboard'
import { formatTutorRichText } from '../whiteboardTutor'
import PanelScrollArea from './PanelScrollArea'

export interface ChatTabProps {
  className?: string
  hasPhoto: boolean
  messages: WhiteboardTutorMessage[]
  responseAge: string
  responseAgeInvalid: boolean
  onResponseAgeChange: (value: string) => void
  draft: string
  isSubmitting: boolean
  onDraftChange: (value: string) => void
  onSubmit: () => void
}

const ChatTab: React.FC<ChatTabProps> = ({
  className = '',
  hasPhoto,
  messages,
  responseAge,
  responseAgeInvalid,
  onResponseAgeChange,
  draft,
  isSubmitting,
  onDraftChange,
  onSubmit,
}) => {
  return (
    <div className={`flex h-full min-h-0 flex-col bg-[#1c1c1e] text-[#F0EDE8] ${className}`}>
      <PanelScrollArea className="flex-1" contentClassName="h-full px-4 py-4">
        <div className="space-y-3 pb-6">
        {!hasPhoto ? (
          <div className="rounded-[8px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-[14px] leading-[1.6] text-[#c6b4a4]">
            Import a photo to keep helper notes and follow-up coaching in one place.
          </div>
        ) : null}

        {hasPhoto && messages.length === 0 ? (
          <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-4 text-[14px] leading-[1.6] text-[#c6b4a4]">
            Use this tab for the person helping the learner. It keeps the back-and-forth coaching history for this session.
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-[8px] px-4 py-3 text-[14px] leading-[1.6] transition-colors ${
              message.role === 'assistant'
                ? 'border border-white/10 bg-white/[0.03] text-[#F0EDE8] hover:bg-white/[0.06]'
                : 'ml-8 bg-amber-500 text-slate-950'
            }`}
          >
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">
              {message.role === 'assistant' ? 'Tutor Reply' : 'Helper'}
            </div>
            <div dangerouslySetInnerHTML={{ __html: formatTutorRichText(message.content) }} />
          </div>
        ))}
        </div>
      </PanelScrollArea>

      <div className="border-t border-white/10 p-4">
        <div className="mb-4">
          <label htmlFor="chat-response-age" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">
            Response age (optional)
          </label>
          <input
            id="chat-response-age"
            type="number"
            min={5}
            max={20}
            inputMode="numeric"
            value={responseAge}
            onChange={(event) => onResponseAgeChange(event.target.value)}
            className="w-full rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] text-[#F0EDE8] outline-none transition focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(201,130,43,0.16)]"
            placeholder="Enter 5-20 to match the explanation level"
            aria-invalid={responseAgeInvalid}
            aria-describedby="helper-chat-response-age-help"
          />
          <p id="helper-chat-response-age-help" className={`mt-2 text-[14px] leading-[1.6] ${responseAgeInvalid ? 'text-red-300' : 'text-[#c6b4a4]'}`}>
            {responseAgeInvalid
              ? 'Enter a whole-number age from 5 to 20.'
              : 'The tutor will match the explanation level without asking the learner for their age.'}
          </p>
        </div>

        <div className="relative w-full">
          <input
            aria-label="Send a helper chat message"
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
            className="min-w-0 w-full rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3 pr-22 text-[14px] text-[#F0EDE8] outline-none transition placeholder:text-[14px] placeholder:text-[#c6b4a4] focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(201,130,43,0.16)]"
            placeholder={hasPhoto ? 'Add a helper note or question...' : 'Import a photo first'}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={!hasPhoto || isSubmitting || !draft.trim() || responseAgeInvalid}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[18px] bg-amber-500 px-3 py-1.5 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
          >
            <span className="flex items-center gap-1">
              <SendHorizonal className="h-3.5 w-3.5" />
              {isSubmitting ? 'Sending…' : 'Send'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatTab
