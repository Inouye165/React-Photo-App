import React, { useState } from 'react'

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
  /** Custom tab content renderers */
  renderTabContent?: (tab: TabType) => React.ReactNode
}

const RightSidePanel: React.FC<RightSidePanelProps> = ({
  className = '',
  initialTab = 'ai-tutor',
  width = '360px',
  backgroundColor = '#161b22',
  onTabChange,
  renderTabContent
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  const tabs = [
    { id: 'ai-tutor' as TabType, label: 'AI Tutor' },
    { id: 'chat' as TabType, label: 'Chat' },
    { id: 'steps' as TabType, label: 'Steps' },
  ]

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    onTabChange?.(tab)
  }

  const getDefaultTabContent = (tab: TabType) => {
    switch (tab) {
      case 'ai-tutor':
        return <div className="text-[#666] p-4">AI Tutor placeholder</div>
      case 'chat':
        return <div className="text-[#666] p-4">Chat placeholder</div>
      case 'steps':
        return <div className="text-[#666] p-4">Steps placeholder</div>
      default:
        return null
    }
  }

  const panelStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    backgroundColor,
    fontFamily: '"DM Sans", sans-serif'
  }

  return (
    <div 
      className={`flex flex-col h-full ${className}`}
      style={panelStyle}
    >
      {/* Tabs */}
      <div className="flex border-b border-[#30363d]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-[#F59E0B]'
                : 'text-[#8b949e] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {renderTabContent ? renderTabContent(activeTab) : getDefaultTabContent(activeTab)}
      </div>
    </div>
  )
}

export default RightSidePanel
