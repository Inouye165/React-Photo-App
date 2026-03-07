import React from 'react'

export interface AITutorTabProps {
  /** Optional custom className for styling */
  className?: string
}

/**
 * AI Tutor tab component for whiteboard assistance
 */
const AITutorTab: React.FC<AITutorTabProps> = ({ className = '' }) => {
  return (
    <div className={`text-[#666] p-4 ${className}`}>
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center">
          <h3 className="text-lg font-medium text-white mb-2">AI Tutor</h3>
          <p className="text-sm">AI-powered whiteboard assistance coming soon...</p>
        </div>
      </div>
    </div>
  )
}

export default AITutorTab
