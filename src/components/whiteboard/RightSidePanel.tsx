import React from 'react'
import TabbedPanel, { type TabConfig } from '../common/TabbedPanel'
import { AITutorTab, ChatTab, HelpRequestTab, StepsTab } from './tabs'
import type { TutorLessonMessage } from './tabs/AITutorTab'
import type { TutorAnalysisResult, WhiteboardHelpRequest, WhiteboardTutorResponse } from '../../types/whiteboard'

export type TabType = 'ai-tutor' | 'help-request' | 'chat' | 'steps'

export interface RightSidePanelProps {
  className?: string
  initialTab?: TabType
  activeTab?: TabType
  panelMode?: 'student' | 'tutor'
  width?: string | number
  backgroundColor?: string
  onTabChange?: (tab: TabType) => void
  hasPhoto: boolean
  hasBoardContent?: boolean
  hasInput?: boolean
  inputMode?: 'photo' | 'text'
  problemDraft?: string
  helpRequestDraft?: string
  onHelpRequestDraftChange?: (value: string) => void
  activeHelpRequest?: WhiteboardHelpRequest | null
  helpRequestSubmitting?: boolean
  helpRequestError?: string | null
  onSubmitHelpRequest?: () => void
  readyIntent?: 'analyze' | 'solve' | 'steps'
  onReadyIntentChange?: (value: 'analyze' | 'solve' | 'steps') => void
  onProblemDraftChange?: (value: string) => void
  analysis: WhiteboardTutorResponse | null
  analysisResult?: TutorAnalysisResult | null
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
  onRequestHumanTutor: () => void
  onLessonMessageChange?: (message: TutorLessonMessage | null) => void
  activeTutorStepId?: string | null
  overlayVisible?: boolean
  tutorPlaybackCanPlay?: boolean
  tutorPlaybackIsPlaying?: boolean
  onToggleTutorOverlay?: () => void
  onTutorPlaybackPlay?: () => void
  onTutorPlaybackPause?: () => void
  onTutorPlaybackPrevious?: () => void
  onTutorPlaybackNext?: () => void
  onTutorPlaybackReplay?: () => void
  onTutorStepSelect?: (stepId: string) => void
}

const RightSidePanel: React.FC<RightSidePanelProps> = ({
  className = '',
  initialTab = 'chat',
  activeTab,
  panelMode = 'student',
  width = 'clamp(380px, 35vw, 560px)',
  backgroundColor = '#1c1c1e',
  onTabChange,
  hasPhoto,
  hasBoardContent = false,
  hasInput,
  inputMode = 'photo',
  problemDraft = '',
  helpRequestDraft = '',
  onHelpRequestDraftChange,
  activeHelpRequest = null,
  helpRequestSubmitting = false,
  helpRequestError = null,
  onSubmitHelpRequest,
  readyIntent = 'analyze',
  onReadyIntentChange,
  onProblemDraftChange,
  analysis,
  analysisResult = null,
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
  onRequestHumanTutor,
  onLessonMessageChange,
  activeTutorStepId = null,
  overlayVisible = true,
  tutorPlaybackCanPlay = false,
  tutorPlaybackIsPlaying = false,
  onToggleTutorOverlay,
  onTutorPlaybackPlay,
  onTutorPlaybackPause,
  onTutorPlaybackPrevious,
  onTutorPlaybackNext,
  onTutorPlaybackReplay,
  onTutorStepSelect,
}) => {
  const helpTab: TabConfig<TabType> = {
    id: 'help-request',
    label: 'HELP',
    content: (
      <HelpRequestTab
        hasPhoto={hasPhoto}
        hasBoardContent={hasBoardContent}
        problemDraft={problemDraft}
        helpRequestDraft={helpRequestDraft}
        onHelpRequestDraftChange={onHelpRequestDraftChange}
        activeRequest={activeHelpRequest}
        isSubmitting={helpRequestSubmitting}
        submitError={helpRequestError}
        onSubmit={() => onSubmitHelpRequest?.()}
      />
    ),
  }

  const tabs: TabConfig<TabType>[] = [
    {
      id: 'chat',
      label: 'CHAT',
      content: (
        <ChatTab
          onRequestHumanTutor={onRequestHumanTutor}
        />
      )
    },
    ...(panelMode === 'tutor'
      ? [{
        id: 'steps' as TabType,
        label: 'STEPS',
        content: (
          <StepsTab
            hasPhoto={hasPhoto}
            isLoading={analysisLoading}
            correctSolution={analysis?.correctSolution ?? ''}
            analysisResult={analysisResult}
            steps={analysis?.steps ?? []}
            activeStepId={activeTutorStepId}
            overlayVisible={overlayVisible}
            canPlay={tutorPlaybackCanPlay}
            isPlaying={tutorPlaybackIsPlaying}
            onToggleOverlay={onToggleTutorOverlay}
            onPlay={onTutorPlaybackPlay}
            onPause={onTutorPlaybackPause}
            onPrevious={onTutorPlaybackPrevious}
            onNext={onTutorPlaybackNext}
            onReplay={onTutorPlaybackReplay}
            onStepSelect={onTutorStepSelect}
          />
        )
      } satisfies TabConfig<TabType>] : []),
    ...(panelMode === 'tutor' ? [{
      id: 'ai-tutor' as TabType,
      label: 'TUTOR ASSIST',
      content: (
        <AITutorTab
          hasPhoto={hasPhoto}
          hasBoardContent={hasBoardContent}
          hasInput={hasInput ?? hasPhoto}
          inputMode={inputMode}
          problemDraft={problemDraft}
          helpRequestDraft={helpRequestDraft}
          onHelpRequestDraftChange={onHelpRequestDraftChange}
          readyIntent={readyIntent}
          onReadyIntentChange={onReadyIntentChange}
          onProblemDraftChange={onProblemDraftChange}
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
          onLessonMessageChange={onLessonMessageChange}
        />
      )
    } satisfies TabConfig<TabType>] : [helpTab]),
  ]

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
        activeTab={activeTab}
        initialTab={initialTab}
        onTabChange={onTabChange}
        renderTabButton={(tab, isActive, onClick) => (
          <button
            type="button"
            onClick={onClick}
            aria-label={`${tab.label} tab`}
            className={`flex w-full items-center justify-center rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              isActive
                ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-[0_10px_24px_rgba(201,130,43,0.22)]'
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
