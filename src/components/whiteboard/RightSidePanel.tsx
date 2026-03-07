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
  width = '320px',
  backgroundColor = '#161b22',
  onTabChange,
  hasPhoto,
  analysis,
  analysisLoading,
  analysisError,
  onStartAnalysis,
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
          followUpDraft={tutorDraft}
          isSubmitting={tutorSubmitting}
          onFollowUpDraftChange={onTutorDraftChange}
          onSubmitFollowUp={onTutorSubmit}
        />
      )
    },
    {
      id: 'chat',
      label: 'Chat',
      content: (
        <ChatTab
          hasPhoto={hasPhoto}
          messages={chatMessages}
          draft={chatDraft}
          isSubmitting={chatSubmitting}
          onDraftChange={onChatDraftChange}
          onSubmit={onChatSubmit}
        />
      )
    },
    {
      id: 'steps',
      label: 'Steps',
      content: <StepsTab hasPhoto={hasPhoto} isLoading={analysisLoading} steps={analysis?.steps ?? []} />
    }
  ]

  const panelStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    minWidth: typeof width === 'number' ? `${width}px` : width,
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
      />
    </div>
  )
}

export default RightSidePanel
