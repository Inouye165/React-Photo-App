import React from 'react'

export interface ChatTabProps {
  /** Optional custom className for styling */
  className?: string
}

/**
 * Chat tab component for whiteboard collaboration
 */
const ChatTab: React.FC<ChatTabProps> = ({ className = '' }) => {
  return (
    <div className={`text-[#666] p-4 ${className}`}>
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center">
          <h3 className="text-lg font-medium text-white mb-2">Chat</h3>
          <p className="text-sm">Real-time collaboration chat coming soon...</p>
        </div>
      </div>
    </div>
  )
}

export default ChatTab
