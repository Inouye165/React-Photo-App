import { useEffect, useRef, useState, type RefObject } from 'react'

type UseClampedElementWidthOptions = {
  min: number
  max: number
  horizontalPadding?: number
}

type UseClampedElementWidthResult = {
  containerRef: RefObject<HTMLDivElement | null>
  width: number
}

export function useClampedElementWidth({
  min,
  max,
  horizontalPadding = 0,
}: UseClampedElementWidthOptions): UseClampedElementWidthResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(max)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    let frame = 0

    const applyWidth = () => {
      frame = 0
      const availableWidth = Math.max(0, Math.floor(container.clientWidth - horizontalPadding))
      const nextWidth = Math.max(min, Math.min(max, availableWidth))
      setWidth((prev) => (prev === nextWidth ? prev : nextWidth))
    }

    applyWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', applyWidth)
      return () => window.removeEventListener('resize', applyWidth)
    }

    const observer = new ResizeObserver(() => {
      if (frame) return
      frame = window.requestAnimationFrame(applyWidth)
    })

    observer.observe(container)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [horizontalPadding, max, min])

  return { containerRef, width }
}
