import React, { useState } from 'react'

export interface TabConfig<T extends string = string> {
  id: T
  label: string
  content?: React.ReactNode
}

export interface TabbedPanelProps<T extends string = string> {
  /** Array of tab configurations */
  tabs: TabConfig<T>[]
  /** Initially active tab */
  initialTab?: T
  /** Callback when tab changes */
  onTabChange?: (tabId: T) => void
  /** Custom className for styling */
  className?: string
  /** Custom tab button renderer */
  renderTabButton?: (tab: TabConfig<T>, isActive: boolean, onClick: () => void) => React.ReactNode
  /** Custom content renderer */
  renderContent?: (activeTab: T) => React.ReactNode
}

/**
 * Generic tabbed panel component that can be reused throughout the app
 */
function TabbedPanel<T extends string = string>({
  tabs,
  initialTab,
  onTabChange,
  className = '',
  renderTabButton,
  renderContent
}: TabbedPanelProps<T>) {
  const [activeTab, setActiveTab] = useState<T>(initialTab || tabs[0]?.id)

  const handleTabChange = (tabId: T) => {
    setActiveTab(tabId)
    onTabChange?.(tabId)
  }

  const defaultTabButton = (tab: TabConfig<T>, isActive: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
        isActive
          ? 'text-white border-b-2 border-[#F59E0B]'
          : 'text-[#8b949e] hover:text-white'
      }`}
    >
      {tab.label}
    </button>
  )

  const defaultContent = () => {
    const activeTabConfig = tabs.find(tab => tab.id === activeTab)
    return activeTabConfig?.content || null
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Tab Headers */}
      <div className="flex border-b border-[#30363d]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <div key={tab.id} className="flex-1">
              {renderTabButton 
                ? renderTabButton(tab, isActive, () => handleTabChange(tab.id))
                : defaultTabButton(tab, isActive, () => handleTabChange(tab.id))
              }
            </div>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {renderContent ? renderContent(activeTab) : defaultContent()}
      </div>
    </div>
  )
}

export default TabbedPanel
