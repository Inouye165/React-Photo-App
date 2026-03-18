import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { ComponentProps, ComponentType } from 'react'
import { useRealtimeToken } from '../../hooks/useRealtimeToken'
import WhiteboardCanvas, {
  type AnnotationTool,
  type BackgroundImageAsset,
  type BackgroundInfo,
  type WhiteboardCanvasHandle,
} from './WhiteboardCanvas'
import type { WhiteboardBoardFrame } from './types'

type BackgroundFitMode = 'width' | 'contain'

type WhiteboardPadProps = {
  boardId: string
  className?: string
  onAccessDenied?: () => void
  onRealtimeStatusChange?: (status: 'connected' | 'connecting' | 'offline') => void
  onViewModeChange?: (enabled: boolean) => void
  onBackgroundFitModeChange?: (mode: BackgroundFitMode) => void
  onHasBackgroundChange?: (hasBackground: boolean) => void
  onHasBoardContentChange?: (hasContent: boolean) => void
  onBackgroundInfoChange?: (info: BackgroundInfo | null) => void
  onBackgroundImageAssetChange?: (asset: BackgroundImageAsset | null) => void
  onBoardFrameChange?: (rect: WhiteboardBoardFrame) => void
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
      onHasBoardContentChange,
      onBackgroundInfoChange,
      onBackgroundImageAssetChange,
      onBoardFrameChange,
      annotationMode,
    },
    ref,
  ) => {
    const { token } = useRealtimeToken()
    const tokenRef = useRef(token)
    const canvasRef = useRef<WhiteboardCanvasHandle>(null)
    const WhiteboardCanvasComponent = WhiteboardCanvas as unknown as ComponentType<
      ComponentProps<typeof WhiteboardCanvas> & {
        onBoardFrameChange?: (rect: WhiteboardBoardFrame) => void
      }
    >
    useEffect(() => {
      tokenRef.current = token
    }, [token])
    useImperativeHandle(ref, () => ({
      openBackgroundPicker: () => canvasRef.current?.openBackgroundPicker(),
      insertImageFile: (file) => canvasRef.current?.insertImageFile(file) ?? Promise.resolve(),
      clearCanvas: () => canvasRef.current?.clearCanvas(),
      clearBackground: () => canvasRef.current?.clearBackground(),
      toggleBackgroundFitMode: () => canvasRef.current?.toggleBackgroundFitMode(),
      toggleViewMode: () => canvasRef.current?.toggleViewMode(),
      undo: () => canvasRef.current?.undo(),
      redo: () => canvasRef.current?.redo(),
      setAnnotationTool: (tool: AnnotationTool) => canvasRef.current?.setAnnotationTool(tool),
      setAnnotationStyle: (style) => canvasRef.current?.setAnnotationStyle(style),
    }))
    return (
      <div className={`flex h-full w-full flex-col ${className || ''}`}>
        <div className="flex-1 min-h-0">
          <WhiteboardCanvasComponent
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
            onHasBoardContentChange={onHasBoardContentChange}
            onBackgroundInfoChange={onBackgroundInfoChange}
            onBackgroundImageAssetChange={onBackgroundImageAssetChange}
            onBoardFrameChange={onBoardFrameChange}
            annotationMode={annotationMode}
          />
        </div>
      </div>
    )
  },
)

WhiteboardPad.displayName = 'WhiteboardPad'

export default WhiteboardPad
