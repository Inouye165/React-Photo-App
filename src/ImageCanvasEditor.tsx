import { useEffect, useRef, useState } from 'react'
import { Image as KonvaImage, Layer, Stage, Text as KonvaText } from 'react-konva'
import type Konva from 'konva'
import type { TextStyle } from './types/photo'

type LegacyTextStyle = TextStyle & {
  x?: unknown
  y?: unknown
  fontSize?: unknown
  fill?: unknown
}

type Dimensions = {
  width: number
  height: number
  scale: number
  imgWidth?: number
  imgHeight?: number
}

type TextProps = {
  x: number
  y: number
  text: string
  fontSize: number
  fill: string
  fontFamily: string
  draggable: boolean
  shadowColor: string
  shadowBlur: number
  shadowOpacity: number
}

export interface ImageCanvasEditorProps {
  imageUrl: string
  caption: string
  textStyle?: TextStyle | null
  onSave?: (dataURL: string, newTextStyle: TextStyle) => void | Promise<void>
  isFlipped?: boolean
  onFlip?: () => void
}

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const toString = (value: unknown, fallback: string): string => {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  return String(value)
}

export default function ImageCanvasEditor({
  imageUrl,
  caption,
  textStyle,
  onSave,
  isFlipped,
  onFlip,
}: ImageCanvasEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 0, height: 0, scale: 1 })

  const legacy = textStyle as LegacyTextStyle | null | undefined

  const [textProps, setTextProps] = useState<TextProps>({
    x: toNumber(legacy?.x, 50),
    y: toNumber(legacy?.y, 50),
    text: caption || '',
    fontSize: toNumber(legacy?.fontSize, 32),
    fill: toString(legacy?.fill, '#ffffff'),
    fontFamily: 'Arial',
    draggable: true,
    shadowColor: 'black',
    shadowBlur: 10,
    shadowOpacity: 0.8,
  })

  const stageRef = useRef<Konva.Stage | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Load image and calculate dimensions
  useEffect(() => {
    setImageError(null)
    setImage(null)

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = imageUrl

    img.onload = () => {
      setImage(img)
      setImageError(null)

      // Calculate dimensions to fit container while maintaining aspect ratio
      const container = containerRef.current
      if (container) {
        const containerWidth = container.offsetWidth - 8 // padding
        const containerHeight = container.offsetHeight - 8

        const imgAspect = img.width / img.height
        const containerAspect = containerWidth / containerHeight

        let width: number
        let height: number
        let scale: number
        if (imgAspect > containerAspect) {
          // Image is wider - fit to width
          width = containerWidth
          height = containerWidth / imgAspect
          scale = containerWidth / img.width
        } else {
          // Image is taller - fit to height
          height = containerHeight
          width = containerHeight * imgAspect
          scale = containerHeight / img.height
        }

        setDimensions({ width, height, scale, imgWidth: img.width, imgHeight: img.height })

        // Position text - use saved position if available, otherwise top initially
        // Keep the existing legacy behavior: treat a falsy y as "not set".
        const legacyY = (legacy as Record<string, unknown> | null | undefined)?.y
        if (!legacyY) {
          setTextProps((prev) => ({
            ...prev,
            y: 20,
          }))
        }
      }
    }

    img.onerror = () => {
      console.error('Failed to load image:', imageUrl)
      setImageError('Failed to load image for editing. It may be an unsupported format or conversion failed.')
      setImage(null)
    }
  }, [imageUrl, legacy])

  // Update caption text when prop changes
  useEffect(() => {
    setTextProps((prev) => ({ ...prev, text: caption || '' }))
  }, [caption])

  // Drag bound function to constrain text within image boundaries
  const handleDragBound = (pos: { x: number; y: number }) => {
    const textNode = stageRef.current?.findOne<Konva.Text>('.caption-text')
    if (!textNode || !dimensions.width) return pos

    const textHeight = textNode.height()

    return {
      x: 0, // Lock horizontal movement to keep centered
      y: Math.max(0, Math.min(pos.y, dimensions.height - textHeight)),
    }
  }

  // Handle save
  const handleSave = () => {
    if (!stageRef.current) return

    const scale = dimensions.scale > 0 ? dimensions.scale : 1

    // Export canvas as data URL
    const dataURL = stageRef.current.toDataURL({
      pixelRatio: 1 / scale, // Export at original resolution
      mimeType: 'image/jpeg',
      quality: 0.9,
    })

    console.log('Canvas exported:', dataURL.substring(0, 100) + '...')
    if (onSave) {
      onSave(dataURL, {
        x: textProps.x,
        y: textProps.y,
        fontSize: textProps.fontSize,
        fill: textProps.fill,
      })
    }
  }

  if (imageError) {
    return (
      <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center bg-gray-100 p-4">
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-2">⚠️ Image Loading Error</p>
          <p className="text-gray-700 text-sm mb-4">{imageError}</p>
          <p className="text-gray-600 text-xs">Unable to load image for editing. Please try again or contact support.</p>
        </div>
      </div>
    )
  }

  if (!image || !dimensions.width) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading image...</p>
      </div>
    )
  }

  return (
    <div
      className="w-full h-full flex flex-col bg-slate-100 relative overflow-hidden"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f1f5f9',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top Toolbar - Static, not floating */}
      <div
        className="flex-none h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-10 shadow-sm"
        style={{
          flex: 'none',
          height: '56px',
          backgroundColor: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div className="flex items-center gap-4" style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          {/* Font Size Control */}
          <div className="flex items-center gap-2 group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="text-[10px] font-bold text-slate-400 uppercase tracking-wider"
              style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Size
            </span>
            <input
              type="range"
              min="16"
              max="96"
              value={textProps.fontSize}
              onChange={(e) => setTextProps((prev) => ({ ...prev, fontSize: parseInt(e.target.value, 10) }))}
              className="w-20 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              style={{ width: '80px', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '4px', cursor: 'pointer' }}
            />
            <span
              className="text-xs font-mono text-slate-500 w-8 text-right"
              style={{ fontSize: '12px', fontFamily: 'monospace', color: '#64748b', width: '32px', textAlign: 'right' }}
            >
              {textProps.fontSize}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" style={{ height: '16px', width: '1px', backgroundColor: '#e2e8f0' }}></div>

          {/* Color Control */}
          <div className="flex items-center gap-2 group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="text-[10px] font-bold text-slate-400 uppercase tracking-wider"
              style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Color
            </span>
            <div
              className="relative w-6 h-6 rounded-full overflow-hidden ring-1 ring-slate-200 shadow-sm"
              style={{
                position: 'relative',
                width: '24px',
                height: '24px',
                borderRadius: '9999px',
                overflow: 'hidden',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            >
              <input
                type="color"
                value={textProps.fill}
                onChange={(e) => setTextProps((prev) => ({ ...prev, fill: e.target.value }))}
                className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer p-0 border-0"
                style={{ position: 'absolute', top: '-8px', left: '-8px', width: '40px', height: '40px', cursor: 'pointer', padding: 0, border: 'none' }}
              />
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200" style={{ height: '16px', width: '1px', backgroundColor: '#e2e8f0' }}></div>

          {/* Caption Input - moved to left side */}
          <input
            type="text"
            value={textProps.text}
            onChange={(e) => setTextProps((prev) => ({ ...prev, text: e.target.value }))}
            className="bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500"
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '9999px',
              padding: '6px 16px',
              fontSize: '14px',
              color: '#334155',
              flex: 1,
              maxWidth: '300px',
              outline: 'none',
            }}
            placeholder="Enter caption text..."
          />
        </div>

        <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}>
          {/* Burn Button */}
          <button
            onClick={handleSave}
            className="bg-slate-900 text-white rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide hover:bg-slate-800 transition-all flex items-center gap-2"
            style={{
              backgroundColor: '#0f172a',
              color: 'white',
              borderRadius: '9999px',
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.025em',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '12px', height: '12px' }}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
              />
            </svg>
            Burn Caption
          </button>

          {/* Flip Button - View Metadata */}
          {onFlip && (
            <button
              onClick={onFlip}
              aria-label={isFlipped ? 'Show photo' : 'Show photo details'}
              title={isFlipped ? 'Back to Photo' : 'View Keywords & Metadata'}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: isFlipped ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)',
                border: isFlipped ? '1px solid rgba(51, 65, 85, 0.5)' : '1px solid rgba(226, 232, 240, 0.8)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                transition: 'background-color 0.3s ease, border-color 0.3s ease',
                flexShrink: 0,
              }}
            >
              {isFlipped ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 w-full relative flex items-center justify-center overflow-hidden p-1"
        style={{
          flex: 1,
          width: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '4px',
          backgroundImage:
            'url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgydjJIMUMxeiIgZmlsbD0iI0UyRThGMCIgZmlsbC1ydWxlPSJldmVub2RkIi8+PC9zdmc+")',
        }}
      >
        <div
          className="shadow-2xl rounded-sm overflow-hidden ring-1 ring-black/10 bg-white relative"
          style={{
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            borderRadius: '2px',
            overflow: 'hidden',
            backgroundColor: 'white',
            position: 'relative',
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        >
          <Stage ref={stageRef} width={dimensions.width} height={dimensions.height} style={{ background: 'white' }}>
            <Layer>
              <KonvaImage image={image} width={dimensions.width} height={dimensions.height} />
              <KonvaText
                name="caption-text"
                {...textProps}
                x={0}
                width={dimensions.width}
                align="center"
                padding={20}
                dragBoundFunc={handleDragBound}
                onDragMove={(e) => {
                  setTextProps((prev) => ({
                    ...prev,
                    x: 0,
                    y: e.target.y(),
                  }))
                }}
              />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  )
}
