import { useEffect, useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export interface NewMessageNotificationProps {
  unreadCount: number
  onDismiss: () => void
  showOnce?: boolean
}

/**
 * Popup notification that appears when user has unread messages.
 * Auto-dismisses after 5 seconds or when user interacts with it.
 */
export default function NewMessageNotification({ 
  unreadCount, 
  onDismiss,
  showOnce = true 
}: NewMessageNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [hasShown, setHasShown] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (unreadCount > 0 && !hasShown && showOnce) {
      setIsVisible(true)
      setHasShown(true)

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        handleDismiss()
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [unreadCount, hasShown, showOnce])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(() => {
      onDismiss()
    }, 300) // Wait for fade-out animation
  }

  const handleClick = () => {
    navigate('/chat')
    handleDismiss()
  }

  if (!isVisible || unreadCount === 0) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        fixed top-20 right-4 z-50 max-w-sm
        bg-slate-900 text-white rounded-2xl shadow-2xl
        p-4 flex items-start gap-3
        transition-all duration-300 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
      `}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
          <MessageSquare className="w-5 h-5" />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm mb-1">
          {unreadCount === 1 ? 'New message' : `${unreadCount} new messages`}
        </div>
        <button
          onClick={handleClick}
          className="text-xs text-blue-300 hover:text-blue-200 underline"
        >
          View messages
        </button>
      </div>

      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="flex-shrink-0 p-1 hover:bg-slate-800 rounded-lg transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
