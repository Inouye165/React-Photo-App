import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useRealtimeToken } from '../../hooks/useRealtimeToken'
import WhiteboardCanvas, {
  type AnnotationTool,
  type BackgroundImageAsset,
  type BackgroundInfo,
  type WhiteboardCanvasHandle,
} from './WhiteboardCanvas'

type BackgroundFitMode = 'width' | 'contain'

type WhiteboardPadProps = {
  boardId: string
  className?: string
  onAccessDenied?: () => void
  onRealtimeStatusChange?: (status: 'connected' | 'connecting' | 'offline') => void
  onViewModeChange?: (enabled: boolean) => void
  onBackgroundFitModeChange?: (mode: BackgroundFitMode) => void
  onHasBackgroundChange?: (hasBackground: boolean) => void
  onBackgroundInfoChange?: (info: BackgroundInfo | null) => void
  onBackgroundImageAssetChange?: (asset: BackgroundImageAsset | null) => void
  annotationMode?: boolean
}

const WhiteboardPad = forwardRef<WhiteboardCanvasHandle, WhiteboardPadProps>(
  (
    {
      boardId,
      className,
      onAccessDenied,
      onRealtimeStatusChange,
      onViewModeChange,
      onBackgroundFitModeChange,
      onHasBackgroundChange,
      onBackgroundInfoChange,
      onBackgroundImageAssetChange,
      annotationMode,
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
      insertImageFile: (file) => canvasRef.current?.insertImageFile(file) ?? Promise.resolve(),
      clearBackground: () => canvasRef.current?.clearBackground(),
      toggleBackgroundFitMode: () => canvasRef.current?.toggleBackgroundFitMode(),
      toggleViewMode: () => canvasRef.current?.toggleViewMode(),
      setAnnotationTool: (tool: AnnotationTool) => canvasRef.current?.setAnnotationTool(tool),
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
            onAccessDenied={onAccessDenied}
            onRealtimeStatusChange={onRealtimeStatusChange}
            onViewModeChange={onViewModeChange}
            onBackgroundFitModeChange={onBackgroundFitModeChange}
            onHasBackgroundChange={onHasBackgroundChange}
            onBackgroundInfoChange={onBackgroundInfoChange}
            onBackgroundImageAssetChange={onBackgroundImageAssetChange}
            annotationMode={annotationMode}
          />
        </div>
      </div>
    )
  },
)

WhiteboardPad.displayName = 'WhiteboardPad'

export default WhiteboardPad
