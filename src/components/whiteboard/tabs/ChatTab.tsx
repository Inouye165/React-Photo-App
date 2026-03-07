import React, { useState } from 'react'

export interface ChatTabProps {
  className?: string
  onRequestHumanTutor: () => void
}

const ChatTab: React.FC<ChatTabProps> = ({
  className = '',
  onRequestHumanTutor,
}) => {
  const [requestDraft, setRequestDraft] = useState('')
  const [submitted, setSubmitted] = useState(false)

  return (
    <div className={`flex h-full min-h-0 flex-col bg-[#1c1c1e] text-[#F0EDE8] ${className}`}>
      <div className="flex flex-1 items-center justify-center px-4 py-4 text-center">
        <div className="max-w-[360px] space-y-4">
          <div className="text-[48px]" aria-hidden="true">👩‍🏫</div>
          <div className="space-y-2">
            <h3 className="text-[20px] font-semibold text-[#F0EDE8]">Talk to a Real Tutor</h3>
            <p className="text-[14px] leading-[1.6] text-[#c6b4a4]">Sometimes you need a human. A real tutor can answer your questions live and help you understand concepts the AI might miss.</p>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition focus-within:border-amber-400 focus-within:shadow-[0_0_0_3px_rgba(201,130,43,0.16)]">
            <input
              type="text"
              value={requestDraft}
              onChange={(event) => setRequestDraft(event.target.value)}
              placeholder="Describe what you need help with..."
              aria-label="Describe what you need help with"
              className="w-full bg-transparent px-1 py-2 text-[14px] text-[#F0EDE8] outline-none placeholder:text-[#c6b4a4]"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSubmitted(true)
              onRequestHumanTutor()
            }}
            className="mx-auto inline-flex rounded-[8px] bg-amber-500 px-4 py-2 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
            aria-label="Request a Tutor Session"
          >
            Request a Tutor Session
          </button>
          <p className="text-[12px] leading-[1.6] text-[#c6b4a4]">A tutor will typically respond within a few hours.</p>
          {submitted ? (
            <p className="text-[14px] leading-[1.6] text-amber-300">Got it! We'll connect you with a tutor soon. Check back here for their response. 📬</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default ChatTab
