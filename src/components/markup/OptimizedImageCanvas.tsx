import { useEffect, useRef, useState } from 'react'
import type { OptimizedVariant } from '../../utils/imageOptimization'

type OptimizedImageCanvasProps = {
  image: Pick<OptimizedVariant, 'blob' | 'width' | 'height'>
  className?: string
  ariaLabel?: string
}

export default function OptimizedImageCanvas({
  image,
  className,
  ariaLabel = 'Optimized image canvas',
}: OptimizedImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!image?.blob) return
    const url = URL.createObjectURL(image.blob)
    setObjectUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [image.blob])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !objectUrl) return

    canvas.width = image.width
    canvas.height = image.height

    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
    if (!ctx) return

    const imageFactory = globalThis.Image as unknown as {
      new (): HTMLImageElement
      (): HTMLImageElement
    }
    let img: HTMLImageElement
    try {
      img = new imageFactory()
    } catch {
      try {
        img = imageFactory()
      } catch {
        img = document.createElement('img')
      }
    }
    img.onload = () => {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    img.src = objectUrl

    return () => {
      img.onload = null
    }
  }, [image.height, image.width, objectUrl])

  const mergedClassName = ['block w-full h-auto mx-auto', className].filter(Boolean).join(' ')

  return (
    <canvas
      ref={canvasRef}
      aria-label={ariaLabel}
      className={mergedClassName}
      style={{ width: '100%', height: 'auto' }}
    />
  )
}
