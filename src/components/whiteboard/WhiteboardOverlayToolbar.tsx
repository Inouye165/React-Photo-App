import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, Maximize2, Minimize2, QrCode, X } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { buildPadUrl } from '../../utils/whiteboardPadUrl'

const IDLE_HIDE_MS = 2500

type WhiteboardOverlayToolbarProps = {
  boardId: string
  className?: string
  children: ReactNode
}

type CopyState = 'idle' | 'success' | 'error'

export default function WhiteboardOverlayToolbar({ boardId, className, children }: WhiteboardOverlayToolbarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [isInteracting, setIsInteracting] = useState(false)
  const [isPointerInside, setIsPointerInside] = useState(false)
  const [isFocusedWithin, setIsFocusedWithin] = useState(false)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')

  const padUrl = useMemo(() => buildPadUrl({ boardId }), [boardId])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const revealToolbar = useCallback(() => {
    setToolbarVisible(true)
  }, [])

  const shouldHoldVisible = isPointerInside || isFocusedWithin || isInteracting || isQrOpen

  useEffect(() => {
    if (!toolbarVisible) return
    if (shouldHoldVisible) {
      clearHideTimer()
      return
    }

    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      setToolbarVisible(false)
      hideTimerRef.current = null
    }, IDLE_HIDE_MS)

    return () => clearHideTimer()
  }, [clearHideTimer, shouldHoldVisible, toolbarVisible])

  useEffect(() => {
    return () => clearHideTimer()
  }, [clearHideTimer])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    const handlePointerEnter = () => {
      setIsPointerInside(true)
      revealToolbar()
    }
    const handlePointerLeave = () => {
      setIsPointerInside(false)
      setIsInteracting(false)
    }
    const handlePointerMove = () => {
      revealToolbar()
    }
    const handlePointerDown = () => {
      setIsInteracting(true)
      revealToolbar()
    }
    const handlePointerUp = () => {
      setIsInteracting(false)
    }
    const handleFocusIn = () => {
      setIsFocusedWithin(true)
      revealToolbar()
    }
    const handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget
      if (!(nextTarget instanceof Node) || !root.contains(nextTarget)) {
        setIsFocusedWithin(false)
      }
    }

    root.addEventListener('pointerenter', handlePointerEnter)
    root.addEventListener('pointerleave', handlePointerLeave)
    root.addEventListener('pointermove', handlePointerMove)
    root.addEventListener('pointerdown', handlePointerDown)
    root.addEventListener('pointerup', handlePointerUp)
    root.addEventListener('focusin', handleFocusIn)
    root.addEventListener('focusout', handleFocusOut)

    return () => {
      root.removeEventListener('pointerenter', handlePointerEnter)
      root.removeEventListener('pointerleave', handlePointerLeave)
      root.removeEventListener('pointermove', handlePointerMove)
      root.removeEventListener('pointerdown', handlePointerDown)
      root.removeEventListener('pointerup', handlePointerUp)
      root.removeEventListener('focusin', handleFocusIn)
      root.removeEventListener('focusout', handleFocusOut)
    }
  }, [revealToolbar])

  useEffect(() => {
    if (!isQrOpen) return

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsQrOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [isQrOpen])

  useEffect(() => {
    const root = containerRef.current
    const fullscreenEnabled = typeof document !== 'undefined' && document.fullscreenEnabled
    const supports = Boolean(root?.requestFullscreen && fullscreenEnabled)
    setIsFullscreenSupported(supports)

    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === root)
    }

    document.addEventListener('fullscreenchange', handleChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleChange)
    }
  }, [])

  const handleCopyLink = useCallback(async () => {
    if (!padUrl) return

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(padUrl)
        setCopyState('success')
        return
      }
    } catch {
      // fall back below
    }

    try {
      const textarea = document.createElement('textarea')
      textarea.value = padUrl
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'absolute'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopyState('success')
    } catch {
      setCopyState('error')
    }
  }, [padUrl])

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = setTimeout(() => setCopyState('idle'), 1500)
    return () => clearTimeout(timer)
  }, [copyState])

  const handleToggleFullscreen = useCallback(async () => {
    const root = containerRef.current
    if (!root) return

    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen()
        return
      }

      if (root.requestFullscreen) {
        await root.requestFullscreen()
      }
    } catch {
      // No-op: fullscreen may fail silently
    }
  }, [])

  const toolbarState = toolbarVisible ? 'visible' : 'hidden'

  return (
    <div
      ref={containerRef}
      className={`relative h-full min-h-0 ${className || ''}`}
      data-testid="whiteboard-overlay-container"
    >
      {children}

      <div
        className={`absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-2 py-2 text-slate-700 shadow-sm backdrop-blur transition-opacity ${
          toolbarVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        data-state={toolbarState}
        data-testid="whiteboard-overlay-toolbar"
      >
        <button
          type="button"
          onClick={() => {
            setIsQrOpen(true)
            revealToolbar()
          }}
          aria-label="Open pad mode options"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
        >
          <QrCode className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          disabled={!isFullscreenSupported}
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 ${
            isFullscreenSupported ? '' : 'opacity-40 cursor-not-allowed'
          }`}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {isQrOpen ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pad mode"
          onClick={(event) => {
            if (event.currentTarget === event.target) {
              setIsQrOpen(false)
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Pad mode</h2>
                <p className="text-xs text-slate-500">Open on a phone or tablet to draw.</p>
              </div>
              <button
                type="button"
                aria-label="Close pad mode dialog"
                onClick={() => setIsQrOpen(false)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex justify-center">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <QRCodeCanvas value={padUrl} size={180} bgColor="#ffffff" fgColor="#0f172a" />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 break-all">
                {padUrl}
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Copy className="h-4 w-4" />
                {copyState === 'success' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
