import React from 'react'

export interface StepsTabProps {
  /** Optional custom className for styling */
  className?: string
}

/**
 * Steps tab component for whiteboard workflow guidance
 */
const StepsTab: React.FC<StepsTabProps> = ({ className = '' }) => {
  return (
    <div className={`text-[#666] p-4 ${className}`}>
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center">
          <h3 className="text-lg font-medium text-white mb-2">Steps</h3>
          <p className="text-sm">Step-by-step guidance coming soon...</p>
        </div>
      </div>
    </div>
  )
}

export default StepsTab
