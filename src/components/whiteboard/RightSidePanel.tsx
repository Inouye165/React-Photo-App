import React from 'react'
import TabbedPanel, { type TabConfig } from '../common/TabbedPanel'
import { AITutorTab, ChatTab, StepsTab } from './tabs'
import type { WhiteboardTutorMessage, WhiteboardTutorResponse } from '../../types/whiteboard'

export type TabType = 'ai-tutor' | 'chat' | 'steps'

export interface RightSidePanelProps {
  className?: string
  initialTab?: TabType
  width?: string | number
  backgroundColor?: string
  onTabChange?: (tab: TabType) => void
  hasPhoto: boolean
  analysis: WhiteboardTutorResponse | null
  analysisLoading: boolean
  analysisError: string | null
  onStartAnalysis: () => void
  onRetryAnalysis: () => void
  responseAge: string
  responseAgeInvalid: boolean
  onResponseAgeChange: (value: string) => void
  tutorDraft: string
  tutorSubmitting: boolean
  onTutorDraftChange: (value: string) => void
  onTutorSubmit: () => void
  chatMessages: WhiteboardTutorMessage[]
  chatDraft: string
  chatSubmitting: boolean
  onChatDraftChange: (value: string) => void
  onChatSubmit: () => void
}

const RightSidePanel: React.FC<RightSidePanelProps> = ({
  className = '',
  initialTab = 'ai-tutor',
  width = 'clamp(380px, 35vw, 560px)',
  backgroundColor = '#1c1c1e',
  onTabChange,
  hasPhoto,
  analysis,
  analysisLoading,
  analysisError,
  onStartAnalysis,
  onRetryAnalysis,
  responseAge,
  responseAgeInvalid,
  onResponseAgeChange,
  tutorDraft,
  tutorSubmitting,
  onTutorDraftChange,
  onTutorSubmit,
  chatMessages,
  chatDraft,
  chatSubmitting,
  onChatDraftChange,
  onChatSubmit,
}) => {
  const tabs: TabConfig<TabType>[] = [
    {
      id: 'ai-tutor',
      label: 'AI Tutor',
      content: (
        <AITutorTab
          hasPhoto={hasPhoto}
          analysis={analysis}
          isLoading={analysisLoading}
          error={analysisError}
          onStartAnalysis={onStartAnalysis}
          onRetryAnalysis={onRetryAnalysis}
          responseAge={responseAge}
          responseAgeInvalid={responseAgeInvalid}
          onResponseAgeChange={onResponseAgeChange}
          followUpDraft={tutorDraft}
          isSubmitting={tutorSubmitting}
          onFollowUpDraftChange={onTutorDraftChange}
          onSubmitFollowUp={onTutorSubmit}
        />
      )
    },
  ]

  if (hasPhoto && chatMessages.length > 0) {
    tabs.push({
      id: 'chat',
      label: 'Helper Chat',
      content: (
        <ChatTab
          hasPhoto={hasPhoto}
          messages={chatMessages}
          responseAge={responseAge}
          responseAgeInvalid={responseAgeInvalid}
          onResponseAgeChange={onResponseAgeChange}
          draft={chatDraft}
          isSubmitting={chatSubmitting}
          onDraftChange={onChatDraftChange}
          onSubmit={onChatSubmit}
        />
      )
    })
  }

  if (hasPhoto && ((analysis?.steps?.length ?? 0) > 0 || analysisLoading)) {
    tabs.push({
      id: 'steps',
      label: 'Steps',
      content: <StepsTab hasPhoto={hasPhoto} isLoading={analysisLoading} steps={analysis?.steps ?? []} />
    })
  }

  const resolvedWidth = typeof width === 'number' ? `${Math.max(width, 380)}px` : width

  const panelStyle: React.CSSProperties = {
    // Fix 2: the tutor panel was too narrow, so it now reserves at least 380px and 35vw on wide screens.
    width: resolvedWidth,
    minWidth: '380px',
    backgroundColor,
    fontFamily: '"DM Sans", sans-serif'
  }

  return (
    <div 
      className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-white/10 shadow-[-16px_0_32px_rgba(0,0,0,0.28)] ${className}`}
      style={panelStyle}
    >
      <TabbedPanel
        className="min-h-0"
        tabs={tabs}
        initialTab={initialTab}
        onTabChange={onTabChange}
        renderTabButton={(tab, isActive, onClick) => (
          <button
            type="button"
            onClick={onClick}
            aria-label={`${tab.label} tab`}
            className={`flex w-full items-center justify-center rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              isActive
                ? 'border-amber-400 bg-amber-400/12 text-[#F0EDE8]'
                : 'border-transparent text-[#c6b4a4] hover:border-amber-400/40 hover:bg-white/[0.04] hover:text-[#F0EDE8]'
            }`}
          >
            {tab.label}
          </button>
        )}
      />
    </div>
  )
}

export default RightSidePanel
