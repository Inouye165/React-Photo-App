import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
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
        <div className="flex-1 min-h-0">
          <WhiteboardCanvas
            ref={canvasRef}
            boardId={boardId}
            token={token}
            mode="pad"
            className="h-full"
            onViewModeChange={(enabled) => {
              onViewModeChange?.(enabled)
            }}
            onBackgroundFitModeChange={(mode) => {
              onBackgroundFitModeChange?.(mode)
            }}
            onHasBackgroundChange={(has) => {
              onHasBackgroundChange?.(has)
            }}
            onBackgroundInfoChange={(info) => {
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
