import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface PanelScrollAreaProps {
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

const PANEL_FADE_BACKGROUND = '#1c1c1e'

const PanelScrollArea: React.FC<PanelScrollAreaProps> = ({ className = '', contentClassName = '', children }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  const updateFadeState = useMemo(
    () => () => {
      const element = scrollRef.current
      if (!element) return

      const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0)
      setShowTopFade(element.scrollTop > 4)
      setShowBottomFade(maxScrollTop - element.scrollTop > 4)
    },
    [],
  )

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    updateFadeState()
    element.addEventListener('scroll', updateFadeState)
    window.addEventListener('resize', updateFadeState)

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateFadeState())
      : null

    observer?.observe(element)

    return () => {
      element.removeEventListener('scroll', updateFadeState)
      window.removeEventListener('resize', updateFadeState)
      observer?.disconnect()
    }
  }, [updateFadeState])

  return (
    <div className={`relative min-h-0 ${className}`}>
      <div ref={scrollRef} className={`h-full overflow-y-auto ${contentClassName}`}>
        {children}
      </div>

      {showTopFade ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-12 items-start justify-center" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(to bottom, ${PANEL_FADE_BACKGROUND} 0%, rgba(28, 28, 30, 0) 100%)` }}
          />
          <ChevronUp className="tutor-scroll-chevron relative mt-1 h-4 w-4 text-[#F0EDE8]/50" />
        </div>
      ) : null}

      {showBottomFade ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-12 items-end justify-center" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(to top, ${PANEL_FADE_BACKGROUND} 0%, rgba(28, 28, 30, 0) 100%)` }}
          />
          <ChevronDown className="tutor-scroll-chevron relative mb-1 h-4 w-4 text-[#F0EDE8]/50" />
        </div>
      ) : null}
    </div>
  )
}

export default PanelScrollArea