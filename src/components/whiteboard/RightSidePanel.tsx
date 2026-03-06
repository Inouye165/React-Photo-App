import React, { useState } from 'react'

type TabType = 'ai-tutor' | 'chat' | 'steps'

const RightSidePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('ai-tutor')

  const tabs = [
    { id: 'ai-tutor' as TabType, label: 'AI Tutor' },
    { id: 'chat' as TabType, label: 'Chat' },
    { id: 'steps' as TabType, label: 'Steps' },
  ]

  const getTabContent = () => {
    switch (activeTab) {
      case 'ai-tutor':
        return <div className="text-[#666]">AI Tutor placeholder</div>
      case 'chat':
        return <div className="text-[#666]">Chat placeholder</div>
      case 'steps':
        return <div className="text-[#666]">Steps placeholder</div>
      default:
        return null
    }
  }

  return (
    <div 
      className="flex flex-col h-full"
      style={{ 
        width: '360px',
        backgroundColor: '#161b22',
        fontFamily: '"DM Sans", sans-serif'
      }}
    >
      {/* Tabs */}
      <div className="flex border-b border-[#30363d]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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
      <div className="flex-1 p-6 overflow-auto">
        {getTabContent()}
      </div>
    </div>
  )
}

export default RightSidePanel
