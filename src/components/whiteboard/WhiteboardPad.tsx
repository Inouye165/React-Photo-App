import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useRealtimeToken } from '../../hooks/useRealtimeToken'
import WhiteboardCanvas, { type WhiteboardCanvasHandle } from './WhiteboardCanvas'

type BackgroundFitMode = 'width' | 'contain'

type WhiteboardPadProps = {
  boardId: string
  className?: string
  onViewModeChange?: (enabled: boolean) => void
  onBackgroundFitModeChange?: (mode: BackgroundFitMode) => void
  onHasBackgroundChange?: (hasBackground: boolean) => void
}

const WhiteboardPad = forwardRef<WhiteboardCanvasHandle, WhiteboardPadProps>(
  ({ boardId, className, onViewModeChange, onBackgroundFitModeChange, onHasBackgroundChange }, ref) => {
    const { token } = useRealtimeToken()
    const tokenRef = useRef(token)
    const canvasRef = useRef<WhiteboardCanvasHandle>(null)
    const [viewModeEnabled, setViewModeEnabled] = useState(false)
    const [backgroundFitMode, setBackgroundFitMode] = useState<BackgroundFitMode>('width')
    const [hasBackground, setHasBackground] = useState(false)
    useEffect(() => {
      tokenRef.current = token
    }, [token])
    useImperativeHandle(ref, () => ({
      openBackgroundPicker: () => canvasRef.current?.openBackgroundPicker(),
      clearBackground: () => canvasRef.current?.clearBackground(),
      toggleBackgroundFitMode: () => canvasRef.current?.toggleBackgroundFitMode(),
      toggleViewMode: () => canvasRef.current?.toggleViewMode(),
    }))
    return (
      <div className={`flex h-full w-full flex-col ${className || ''}`}>
        <div className="relative flex-1 min-h-0">
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
          />
        </div>
      </div>
    )
  },
)

WhiteboardPad.displayName = 'WhiteboardPad'

export default WhiteboardPad
