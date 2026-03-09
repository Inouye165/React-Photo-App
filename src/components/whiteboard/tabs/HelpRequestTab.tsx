import React from 'react'
import type { WhiteboardHelpRequest } from '../../../types/whiteboard'

export interface HelpRequestTabProps {
  hasPhoto: boolean
  hasBoardContent?: boolean
  problemDraft?: string
  helpRequestDraft?: string
  onHelpRequestDraftChange?: (value: string) => void
  activeRequest: WhiteboardHelpRequest | null
  isSubmitting: boolean
  submitError: string | null
  onSubmit: () => void
}

function statusCopy(request: WhiteboardHelpRequest) {
  if (request.status === 'claimed') {
    return {
      badge: 'Claimed',
      title: 'A tutor has picked this up',
      body: request.claimedByUsername
        ? `${request.claimedByUsername} claimed your request and can now join the whiteboard.`
        : 'A tutor claimed your request and can now join the whiteboard.',
    }
  }

  return {
    badge: 'Pending',
    title: 'Waiting in the tutor queue',
    body: 'Your request is in the tutor queue now. Keep working on the whiteboard while a tutor picks it up.',
  }
}

export default function HelpRequestTab({
  hasPhoto,
  hasBoardContent = false,
  problemDraft = '',
  helpRequestDraft = '',
  onHelpRequestDraftChange,
  activeRequest,
  isSubmitting,
  submitError,
  onSubmit,
}: HelpRequestTabProps): React.JSX.Element {
  const hasTypedProblem = problemDraft.trim().length > 0
  const requestDisabled = isSubmitting || Boolean(activeRequest)
  const readySummary = hasPhoto
    ? 'A problem photo is attached to this whiteboard.'
    : hasTypedProblem
      ? 'Your typed problem will be included with the request.'
      : hasBoardContent
        ? 'Your whiteboard work will give the tutor context.'
        : 'Add a short note so tutors know what you need help with.'

  if (activeRequest) {
    const copy = statusCopy(activeRequest)

    return (
      <div className="flex h-full flex-col bg-[#1c1c1e] text-[#F0EDE8]">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Request help</div>
          <h2 className="mt-2 text-[20px] font-semibold">{copy.title}</h2>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#c6b4a4]">{copy.body}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="rounded-[16px] border border-amber-400/25 bg-amber-500/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[14px] font-semibold text-[#F0EDE8]">Current request</div>
              <span className="rounded-full border border-amber-400/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-200">
                {copy.badge}
              </span>
            </div>

            <div className="mt-3 space-y-3 text-[13px] leading-[1.6] text-[#d8cfc4]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Request note</div>
                <p className="mt-1 whitespace-pre-wrap">{activeRequest.requestText || 'Help requested on this whiteboard.'}</p>
              </div>
              {activeRequest.problemDraft ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Problem context</div>
                  <p className="mt-1 whitespace-pre-wrap">{activeRequest.problemDraft}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#1c1c1e] text-[#F0EDE8]">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Request help</div>
        <h2 className="mt-2 text-[20px] font-semibold">Send this board to the tutor queue</h2>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#c6b4a4]">
          Tutors will see your whiteboard, your uploaded problem, and the short note you add here.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Board context</div>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#d8cfc4]">{readySummary}</p>
        </div>

        <label htmlFor="help-request-note" className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">
          What do you want help with?
        </label>
        <textarea
          id="help-request-note"
          aria-label="What do you want help with"
          value={helpRequestDraft}
          onChange={(event) => onHelpRequestDraftChange?.(event.target.value)}
          placeholder="Example: Check whether I set this up correctly, or show me the next step."
          className="mt-2 min-h-[140px] w-full rounded-[14px] border border-white/10 bg-[#121214] px-4 py-3 text-[14px] text-[#F0EDE8] outline-none transition placeholder:text-white/30 focus:border-amber-400/60"
        />

        {problemDraft.trim() ? (
          <div className="mt-4 rounded-[16px] border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Typed problem</div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.6] text-[#d8cfc4]">{problemDraft.trim()}</p>
          </div>
        ) : null}

        {submitError ? (
          <div className="mt-4 rounded-[14px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
            {submitError}
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 px-4 py-4">
        <button
          type="button"
          onClick={onSubmit}
          disabled={requestDisabled}
          className="inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-5 py-3 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
        >
          {isSubmitting ? 'Sending request…' : 'Send help request'}
        </button>
      </div>
    </div>
  )
}
