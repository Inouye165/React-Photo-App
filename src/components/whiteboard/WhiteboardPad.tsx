import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useRealtimeToken } from '../../hooks/useRealtimeToken'
import WhiteboardCanvas, { type BackgroundInfo, type WhiteboardCanvasHandle } from './WhiteboardCanvas'

type BackgroundFitMode = 'width' | 'contain'

type WhiteboardPadProps = {
  boardId: string
  className?: string
  onViewModeChange?: (enabled: boolean) => void
  onBackgroundFitModeChange?: (mode: BackgroundFitMode) => void
  onHasBackgroundChange?: (hasBackground: boolean) => void
  onBackgroundInfoChange?: (info: BackgroundInfo | null) => void
}

const WhiteboardPad = forwardRef<WhiteboardCanvasHandle, WhiteboardPadProps>(
  (
    {
      boardId,
      className,
      onViewModeChange,
      onBackgroundFitModeChange,
      onHasBackgroundChange,
      onBackgroundInfoChange,
    },
    ref,
  ) => {
    const { token } = useRealtimeToken()
    const tokenRef = useRef(token)
    const canvasRef = useRef<WhiteboardCanvasHandle>(null)
    const [viewModeEnabled, setViewModeEnabled] = useState(false)
    const [backgroundFitMode, setBackgroundFitMode] = useState<BackgroundFitMode>('width')
    const [hasBackground, setHasBackground] = useState(false)
    const [backgroundInfo, setBackgroundInfo] = useState<BackgroundInfo | null>(null)
    useEffect(() => {
      tokenRef.current = token
    }, [token])
    useImperativeHandle(ref, () => ({
      openBackgroundPicker: () => canvasRef.current?.openBackgroundPicker(),
      clearBackground: () => canvasRef.current?.clearBackground(),
      toggleBackgroundFitMode: () => canvasRef.current?.toggleBackgroundFitMode(),
      toggleViewMode: () => canvasRef.current?.toggleViewMode(),
    }))
    const formatBytes = (bytes: number) => {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      let size = bytes
      let unitIndex = 0
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex += 1
      }
      const rounded = size >= 10 || unitIndex === 0 ? Math.round(size) : Math.round(size * 10) / 10
      return `${rounded} ${units[unitIndex]}`
    }

    return (
      <div className={`flex h-full w-full flex-col ${className || ''}`}>
        <div className="relative flex-1 min-h-0 group">
          <div className="absolute right-4 top-4 z-20 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-900"
              onClick={() => canvasRef.current?.openBackgroundPicker()}
              aria-label="Set background image"
            >
              Set Background
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-900"
              onClick={() => canvasRef.current?.toggleBackgroundFitMode()}
              aria-label={backgroundFitMode === 'width' ? 'Show full image' : 'Fit to width'}
            >
              {backgroundFitMode === 'width' ? 'Show full image' : 'Fit width'}
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
              onClick={() => canvasRef.current?.clearBackground()}
              aria-label="Clear background image"
              disabled={!hasBackground}
            >
              Clear Background
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-900"
              onClick={() => canvasRef.current?.toggleViewMode()}
              aria-pressed={viewModeEnabled}
              aria-label={viewModeEnabled ? 'Switch to draw mode' : 'Switch to view mode'}
            >
              {viewModeEnabled ? 'Draw mode' : 'View mode'}
            </button>
          </div>
          {backgroundInfo && (
            <div className="absolute right-4 top-16 z-20 max-w-[260px] rounded-lg bg-white/90 px-2 py-1 text-[11px] text-slate-700 shadow-sm backdrop-blur opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
              <div className="truncate font-semibold" title={backgroundInfo.name}>
                {backgroundInfo.name}
              </div>
              {backgroundInfo.originalSizeBytes !== undefined && backgroundInfo.convertedSizeBytes !== undefined ? (
                <div className="text-[10px] text-slate-500">
                  {formatBytes(backgroundInfo.originalSizeBytes)} {backgroundInfo.originalType || 'image/*'} {'->'}{' '}
                  {formatBytes(backgroundInfo.convertedSizeBytes)} {backgroundInfo.convertedType || 'image/webp'}
                </div>
              ) : (
                <div className="text-[10px] text-slate-500">{formatBytes(backgroundInfo.sizeBytes)}</div>
              )}
            </div>
          )}
          <WhiteboardCanvas
            ref={canvasRef}
            boardId={boardId}
            token={token}
            mode="pad"
            className="h-full"
            onViewModeChange={(enabled) => {
              setViewModeEnabled(enabled)
              onViewModeChange?.(enabled)
            }}
            onBackgroundFitModeChange={(mode) => {
              setBackgroundFitMode(mode)
              onBackgroundFitModeChange?.(mode)
            }}
            onHasBackgroundChange={(has) => {
              setHasBackground(has)
              onHasBackgroundChange?.(has)
            }}
            onBackgroundInfoChange={(info) => {
              setBackgroundInfo(info)
              onBackgroundInfoChange?.(info)
            }}
          />
        </div>
      </div>
    )
  },
)

WhiteboardPad.displayName = 'WhiteboardPad'

export default WhiteboardPad
