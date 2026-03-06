import React from 'react'
import TabbedPanel, { type TabConfig } from '../common/TabbedPanel'
import { AITutorTab, ChatTab, StepsTab } from './tabs'

export type TabType = 'ai-tutor' | 'chat' | 'steps'

export interface RightSidePanelProps {
  /** Optional custom className for additional styling */
  className?: string
  /** Initial active tab (defaults to 'ai-tutor') */
  initialTab?: TabType
  /** Width of the panel (defaults to 360px) */
  width?: string | number
  /** Background color (defaults to #161b22) */
  backgroundColor?: string
  /** Callback when tab changes */
  onTabChange?: (tab: TabType) => void
}

const RightSidePanel: React.FC<RightSidePanelProps> = ({
  className = '',
  initialTab = 'ai-tutor',
  width = '320px',
  backgroundColor = '#161b22',
  onTabChange
}) => {
  const tabs: TabConfig<TabType>[] = [
    {
      id: 'ai-tutor',
      label: 'AI Tutor',
      content: <AITutorTab />
    },
    {
      id: 'chat',
      label: 'Chat',
      content: <ChatTab />
    },
    {
      id: 'steps',
      label: 'Steps',
      content: <StepsTab />
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
