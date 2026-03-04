import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Plus, Search, MoreVertical, Clock, Edit3 } from 'lucide-react'
import { listMyWhiteboards, createWhiteboard } from '../api/whiteboards'
import { fetchWhiteboardSnapshot } from '../api/whiteboard'
import { listRoomMembers, RoomMemberDetails } from '../api/chat'
import Avatar from '../components/Avatar'
import ChessUserMenu from '../components/ChessUserMenu'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabaseClient'
import { normalizeHistoryEvents } from '../realtime/whiteboardReplay'

function useDesktopLayout(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth >= 1024
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)')
      : null

    const updateLayout = () => {
      setIsDesktop(mediaQuery ? mediaQuery.matches : window.innerWidth >= 1024)
    }

    updateLayout()

    if (mediaQuery) {
      const onChange = () => updateLayout()
      mediaQuery.addEventListener('change', onChange)
      return () => mediaQuery.removeEventListener('change', onChange)
    }

    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  return isDesktop
}

export default function WhiteboardsHubPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [boards, setBoards] = useState<any[]>([])
  const [filteredBoards, setFilteredBoards] = useState<any[]>([])
  const [membersByBoard, setMembersByBoard] = useState<Record<string, RoomMemberDetails[]>>({})
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [createError, setCreateError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'recent' | 'all'>('all')
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const prefersReducedMotion = useReducedMotion()
  const isDesktop = useDesktopLayout()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listMyWhiteboards()
        if (cancelled) return
        // Ensure newest first by updated_at or created_at
        rows.sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at))
        setBoards(rows)
        setFilteredBoards(rows)
        // fetch members for whiteboards (non-blocking)
        void (async () => {
          const map: Record<string, RoomMemberDetails[]> = {}
          await Promise.all(
            rows.map(async (r) => {
              try {
                const m = await listRoomMembers(r.id)
                if (cancelled) return
                map[r.id] = m
              } catch {
                // ignore per-board member load failures
              }
            }),
          )
          if (cancelled) return
          setMembersByBoard(map)
        })()
      } catch (err) {
        if (!cancelled) console.warn('[WB-HUB] load failed', { message: err instanceof Error ? err.message : String(err) })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Filter boards based on search query and tab
  useEffect(() => {
    let filtered = boards
    
    // Filter by tab
    if (activeTab === 'recent') {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter(board => 
        Date.parse(board.updated_at || board.created_at) > oneWeekAgo
      )
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(board => 
        (board.name || 'Whiteboard').toLowerCase().includes(query)
      )
    }
    
    setFilteredBoards(filtered)
  }, [boards, searchQuery, activeTab])

  // Generate gradient color from board name
  const getBoardGradient = (name: string): { from: string; to: string } => {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    return {
      from: `hsl(${hue}, 70%, 25%)`,
      to: `hsl(${(hue + 40) % 360}, 60%, 15%)`
    }
  }

  // Get initials from board name
  const getBoardInitials = (name: string): string => {
    const cleanName = name || 'Whiteboard'
    const words = cleanName.trim().split(/\s+/)
    if (words.length >= 2) {
      return words.slice(0, 2).map(w => w[0]).join('').toUpperCase()
    }
    return cleanName.slice(0, 2).toUpperCase()
  }

  // Format timestamp
  const formatTimestamp = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Handle inline title editing
  const handleTitleEdit = (boardId: string, currentTitle: string) => {
    setEditingBoardId(boardId)
    setEditingTitle(currentTitle || 'Whiteboard')
  }

  const handleTitleSave = async (boardId: string) => {
    // TODO: Implement API call to update board name
    console.log('Saving new title:', boardId, editingTitle)
    setEditingBoardId(null)
    setEditingTitle('')
  }

  const handleTitleCancel = () => {
    setEditingBoardId(null)
    setEditingTitle('')
  }

  // Whiteboard Card Component
  const WhiteboardCard = ({ board, index, isPlaceholder = false }: { board: any; index: number; isPlaceholder?: boolean }) => {
    const gradient = getBoardGradient(board.name || 'Whiteboard')
    const initials = getBoardInitials(board.name || 'Whiteboard')
    const members = membersByBoard[board.id] || []
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isPlaceholder ? 0.6 : 1, y: 0 }}
        transition={{ 
          duration: 0.3, 
          delay: prefersReducedMotion ? 0 : index * 0.05,
          ease: [0.22, 1, 0.36, 1]
        }}
        whileHover={{ 
          y: -3,
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
          borderColor: '#444',
          transition: { duration: 0.2, ease: 'easeOut' }
        }}
        onClick={() => !isPlaceholder && navigate(`/whiteboards/${board.id}`)}
        className={`relative bg-[#1A1A1A] border border-[#252525] rounded-xl overflow-hidden transition-all duration-200 ${
          isPlaceholder ? 'cursor-default' : 'cursor-pointer'
        }`}
        style={{
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
          border: '1px solid #252525'
        }}
      >
        {/* Thumbnail Area */}
        {!isPlaceholder ? (
          <div className="relative">
            <div className="border border-[#e5e5e5] rounded-[4px] overflow-hidden m-3">
              <WhiteboardThumbnail boardId={board.id} boardName={board.name || 'Whiteboard'} />
            </div>
            {/* Context Menu */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                // TODO: Implement context menu
              }}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/20 hover:bg-black/40 transition-colors"
            >
              <MoreVertical className="w-4 h-4 text-white" />
            </button>
          </div>
        ) : (
          <div 
            className="h-40 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white text-2xl font-light drop-shadow-lg">
                {initials}
              </span>
            </div>
          </div>
        )}
        
        {/* Content Area */}
        <div className="p-4 border-t border-[#222]">
          <div className="flex items-center justify-between">
            {/* Title */}
            {editingBoardId === board.id ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTitleSave(board.id)
                  } else if (e.key === 'Escape') {
                    handleTitleCancel()
                  }
                }}
                onBlur={() => handleTitleSave(board.id)}
                className="flex-1 text-sm font-medium text-white bg-transparent border-b border-[#444] outline-none"
                autoFocus
              />
            ) : (
              <div 
                className="flex items-center gap-2 flex-1 cursor-text group"
                onClick={() => handleTitleEdit(board.id, board.name || 'Whiteboard')}
              >
                <h3 className="font-medium text-white text-sm truncate">
                  {board.name || (isPlaceholder ? 'Example Board' : 'Whiteboard')}
                </h3>
                <Edit3 className="w-3 h-3 text-[#666] opacity-0 group-hover:opacity-[0.4] transition-opacity" />
              </div>
            )}
            
            {/* Timestamp */}
            {!isPlaceholder && (
              <div className="flex items-center gap-1 text-[#666] text-xs ml-3 flex-shrink-0">
                <Clock className="w-3 h-3" />
                <span>{formatTimestamp(board.updated_at || board.created_at)}</span>
              </div>
            )}
          </div>
          
          {/* Collaborators */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center -space-x-2">
              {!isPlaceholder && members.slice(0, 3).map((member, idx) => (
                <div
                  key={member.user_id}
                  className="relative"
                  style={{ zIndex: 3 - idx }}
                >
                  <Avatar
                    src={member.avatar_url || (profile?.id === member.user_id ? profile?.avatar_url : undefined)}
                    username={member.username || null}
                    size={32}
                    loading="eager"
                  />
                </div>
              ))}
              {!isPlaceholder && members.length > 3 && (
                <div 
                  className="w-8 h-8 rounded-full bg-[#2A2A2A] border border-[#444] flex items-center justify-center text-xs text-[#666]"
                  style={{ zIndex: 0 }}
                >
                  +{members.length - 3}
                </div>
              )}
              {isPlaceholder && (
                <div className="text-xs text-[#666]">
                  No collaborators
                </div>
              )}
              {!isPlaceholder && members.length === 0 && (
                <div className="text-xs text-[#666]">
                  No collaborators
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  // Whiteboard Thumbnail Component
  const WhiteboardThumbnail = ({ boardId, boardName }: { boardId: string; boardName: string }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(false)
    const [hasLoaded, setHasLoaded] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const emptySnapshotAttemptsRef = useRef(0)
    const MAX_EMPTY_SNAPSHOT_ATTEMPTS = 6

    useEffect(() => {
      let cancelled = false
      let loadTimeout: ReturnType<typeof setTimeout> | null = null
      // Debug: effect mounted for this thumbnail
      // eslint-disable-next-line no-console
      console.log('[WB-THUMB] effect mount', { boardId })

      const loadThumbnail = async () => {
        if (!canvasRef.current || hasLoaded || cancelled) return
        
        try {
          if (!cancelled) {
            setIsLoading(true)
            setError(false)
          }
          
          // Get auth token
          const { data: { session } } = await supabase.auth.getSession()
          // Debug: session fetched
          // eslint-disable-next-line no-console
          console.log('[WB-THUMB] session', { boardId, hasSession: Boolean(session?.access_token), session: session ? { expires_at: session.expires_at } : null })
          if (cancelled) return
          if (!session?.access_token) {
            // eslint-disable-next-line no-console
            console.warn('[WB-THUMB] no auth token available', { boardId, session })
            throw new Error('No auth token')
          }

          // Fetch whiteboard snapshot
          const snapshot = await fetchWhiteboardSnapshot({
            boardId,
            token: session.access_token
          })
          // Debug: surface raw snapshot to help diagnose empty-thumbnail issues
          // (temporary log; remove after investigation)
          // eslint-disable-next-line no-console
          console.log('[WB-THUMB] fetched snapshot', { boardId, snapshot })
          // Log events length if present
          // eslint-disable-next-line no-console
          console.log('[WB-THUMB] snapshot.events', { boardId, eventsLength: Array.isArray(snapshot?.events) ? snapshot.events.length : null })
          if (cancelled) return

          // Draw thumbnail on canvas
          const canvas = canvasRef.current
          if (!canvas) {
            if (!cancelled) setIsLoading(false)
            return
          }

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            if (!cancelled) {
              setError(true)
              setIsLoading(false)
            }
            return
          }

          // Set canvas size
          canvas.width = 320
          canvas.height = 200

          // Clear canvas with background
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          // Draw whiteboard strokes.
          // Snapshot coordinates are normalized (0..1), so replay directly using
          // the same stroke-state behavior as the primary whiteboard canvas.
          const events = Array.isArray(snapshot.events) ? normalizeHistoryEvents(snapshot.events as any) : []
          const drawableEvents = events.filter(
            (event) =>
              (event.type === 'stroke:start' || event.type === 'stroke:move' || event.type === 'stroke:end')
              && Number.isFinite(event.x)
              && Number.isFinite(event.y),
          )
          const excalidrawElements = Array.isArray(snapshot.excalidrawElements) ? snapshot.excalidrawElements : []
          // Debug: show normalized / drawable counts
          // eslint-disable-next-line no-console
          console.log('[WB-THUMB] events counts', { boardId, normalized: events.length, drawable: drawableEvents.length, excalidraw: excalidrawElements.length })

          if (drawableEvents.length > 0) {
            emptySnapshotAttemptsRef.current = 0
            const usesNormalizedCoords = drawableEvents.every(
              (event) => event.x >= -0.01 && event.x <= 1.01 && event.y >= -0.01 && event.y <= 1.01,
            )
            // eslint-disable-next-line no-console
            console.log('[WB-THUMB] usesNormalizedCoords', { boardId, usesNormalizedCoords })

            let minX = 0
            let maxX = 1
            let minY = 0
            let maxY = 1

            if (!usesNormalizedCoords) {
              minX = Math.min(...drawableEvents.map((event) => event.x))
              maxX = Math.max(...drawableEvents.map((event) => event.x))
              minY = Math.min(...drawableEvents.map((event) => event.y))
              maxY = Math.max(...drawableEvents.map((event) => event.y))
            }

            const padding = 10
            const spanX = Math.max(0.0001, maxX - minX)
            const spanY = Math.max(0.0001, maxY - minY)
            const scaleX = (canvas.width - padding * 2) / spanX
            const scaleY = (canvas.height - padding * 2) / spanY
            const absoluteScale = Math.min(scaleX, scaleY)

            const toCanvasPoint = (x: number, y: number): { x: number; y: number } => {
              if (usesNormalizedCoords) {
                return {
                  x: x * canvas.width,
                  y: y * canvas.height,
                }
              }

              return {
                x: padding + (x - minX) * absoluteScale,
                y: padding + (y - minY) * absoluteScale,
              }
            }

            const activeStrokes = new Map<string, { x: number; y: number; color: string; width: number }>()

            for (const event of drawableEvents) {
              const strokeKey = event.strokeId || '__thumbnail_stroke__'
              const color = event.color || '#000000'
              const baseWidth = event.width || 2
              const width = usesNormalizedCoords ? baseWidth : Math.max(1, Math.min(8, baseWidth * absoluteScale))
              const point = toCanvasPoint(event.x, event.y)

              ctx.lineCap = 'round'
              ctx.lineJoin = 'round'

              if (event.type === 'stroke:start') {
                activeStrokes.set(strokeKey, { x: event.x, y: event.y, color, width })
                ctx.strokeStyle = color
                ctx.lineWidth = width
                ctx.beginPath()
                ctx.moveTo(point.x, point.y)
                ctx.lineTo(point.x, point.y)
                ctx.stroke()
                continue
              }

              const previous = activeStrokes.get(strokeKey) || { x: event.x, y: event.y, color, width }
              const previousPoint = toCanvasPoint(previous.x, previous.y)
              ctx.strokeStyle = previous.color
              ctx.lineWidth = previous.width
              ctx.beginPath()
              ctx.moveTo(previousPoint.x, previousPoint.y)
              ctx.lineTo(point.x, point.y)
              ctx.stroke()
              activeStrokes.set(strokeKey, { x: event.x, y: event.y, color: previous.color, width: previous.width })

              if (event.type === 'stroke:end') {
                activeStrokes.delete(strokeKey)
              }
            }
            if (!cancelled) {
              setIsLoading(false)
              setHasLoaded(true)
            }
            return
          } else if (excalidrawElements.length > 0) {
            // Render Excalidraw elements on the thumbnail canvas
            emptySnapshotAttemptsRef.current = 0

            // Calculate bounding box of all elements
            let minX = Infinity
            let maxX = -Infinity
            let minY = Infinity
            let maxY = -Infinity

            for (const el of excalidrawElements) {
              const elMinX = el.x
              const elMinY = el.y
              let elMaxX = el.x + (el.width || 0)
              let elMaxY = el.y + (el.height || 0)

              // For freedraw/line elements, extend bounds by points
              if (Array.isArray(el.points)) {
                for (const pt of el.points) {
                  if (Array.isArray(pt) && pt.length >= 2) {
                    const px = el.x + pt[0]
                    const py = el.y + pt[1]
                    if (px < minX) minX = px
                    if (px > maxX) maxX = px
                    if (py < minY) minY = py
                    if (py > maxY) maxY = py
                  }
                }
              }

              if (elMinX < minX) minX = elMinX
              if (elMaxX > maxX) maxX = elMaxX
              if (elMinY < minY) minY = elMinY
              if (elMaxY > maxY) maxY = elMaxY
            }

            const padding = 10
            const spanX = Math.max(1, maxX - minX)
            const spanY = Math.max(1, maxY - minY)
            const scaleX = (canvas.width - padding * 2) / spanX
            const scaleY = (canvas.height - padding * 2) / spanY
            const scale = Math.min(scaleX, scaleY)

            const toCanvas = (x: number, y: number) => ({
              x: padding + (x - minX) * scale,
              y: padding + (y - minY) * scale,
            })

            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            for (const el of excalidrawElements) {
              const color = el.strokeColor || '#000000'
              const lineWidth = Math.max(1, (el.strokeWidth || 2) * scale)
              const opacity = typeof el.opacity === 'number' ? el.opacity / 100 : 1
              ctx.globalAlpha = opacity
              ctx.strokeStyle = color
              ctx.lineWidth = lineWidth

              if ((el.type === 'freedraw' || el.type === 'line' || el.type === 'arrow') && Array.isArray(el.points) && el.points.length >= 2) {
                ctx.beginPath()
                const first = toCanvas(el.x + el.points[0][0], el.y + el.points[0][1])
                ctx.moveTo(first.x, first.y)
                for (let i = 1; i < el.points.length; i++) {
                  const pt = el.points[i]
                  if (Array.isArray(pt) && pt.length >= 2) {
                    const cp = toCanvas(el.x + pt[0], el.y + pt[1])
                    ctx.lineTo(cp.x, cp.y)
                  }
                }
                ctx.stroke()
              } else if (el.type === 'rectangle') {
                const tl = toCanvas(el.x, el.y)
                const w = el.width * scale
                const h = el.height * scale
                if (el.backgroundColor && el.backgroundColor !== 'transparent') {
                  ctx.fillStyle = el.backgroundColor
                  ctx.fillRect(tl.x, tl.y, w, h)
                }
                ctx.strokeRect(tl.x, tl.y, w, h)
              } else if (el.type === 'ellipse') {
                const cx = el.x + el.width / 2
                const cy = el.y + el.height / 2
                const center = toCanvas(cx, cy)
                const rx = (el.width / 2) * scale
                const ry = (el.height / 2) * scale
                ctx.beginPath()
                ctx.ellipse(center.x, center.y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2)
                if (el.backgroundColor && el.backgroundColor !== 'transparent') {
                  ctx.fillStyle = el.backgroundColor
                  ctx.fill()
                }
                ctx.stroke()
              } else if (el.type === 'diamond') {
                const tl = toCanvas(el.x, el.y)
                const w = el.width * scale
                const h = el.height * scale
                ctx.beginPath()
                ctx.moveTo(tl.x + w / 2, tl.y)
                ctx.lineTo(tl.x + w, tl.y + h / 2)
                ctx.lineTo(tl.x + w / 2, tl.y + h)
                ctx.lineTo(tl.x, tl.y + h / 2)
                ctx.closePath()
                if (el.backgroundColor && el.backgroundColor !== 'transparent') {
                  ctx.fillStyle = el.backgroundColor
                  ctx.fill()
                }
                ctx.stroke()
              }
              // Skip text and image elements for thumbnail
            }

            ctx.globalAlpha = 1

            if (!cancelled) {
              setIsLoading(false)
              setHasLoaded(true)
            }
            return
          } else if (!cancelled) {
            emptySnapshotAttemptsRef.current += 1
            // eslint-disable-next-line no-console
            console.log('[WB-THUMB] empty snapshot - attempt', { boardId, attempt: emptySnapshotAttemptsRef.current })
            const shouldRetry = emptySnapshotAttemptsRef.current < MAX_EMPTY_SNAPSHOT_ATTEMPTS
            if (shouldRetry) {
              if (loadTimeout) {
                clearTimeout(loadTimeout)
              }
              loadTimeout = setTimeout(() => {
                void loadThumbnail()
              }, 400)
              return
            }
            setError(true)
            setIsLoading(false)
            setHasLoaded(true)
            return
          }
        } catch (err) {
          if (cancelled) return
          console.warn('Failed to load whiteboard thumbnail:', err)
          setError(true)
          setIsLoading(false)
        }
      }

      // Only load when thumbnail is visible
      if (!containerRef.current) return
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !hasLoaded) {
              // eslint-disable-next-line no-console
              console.log('[WB-THUMB] observer triggered', { boardId, isIntersecting: entry.isIntersecting })
              // Add small delay to prevent overwhelming the browser
              if (loadTimeout) {
                clearTimeout(loadTimeout)
              }
              loadTimeout = setTimeout(() => {
                void loadThumbnail()
              }, Math.random() * 200)
            }
          })
        },
        { threshold: 0.1 }
      )
      
      observer.observe(containerRef.current)
      
      return () => {
        cancelled = true
        if (loadTimeout) {
          clearTimeout(loadTimeout)
          loadTimeout = null
        }
        observer.disconnect()
      }
    }, [boardId, hasLoaded])

    const gradient = getBoardGradient(boardName)

    // Always render the canvas/container so the IntersectionObserver can
    // attach and the loader can draw into a real canvas. While loading or on
    // error, overlay the gradient + initials so the visual fallback remains.
    return (
      <div ref={containerRef} className="h-40 relative overflow-hidden bg-[#111111] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
          style={{ 
            imageRendering: 'crisp-edges' as any
          }}
          width={320}
          height={200}
        />

        {(error || isLoading) && (
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
            }}
          >
            <div className="absolute inset-0" />
            <span className="text-white text-2xl font-light drop-shadow-lg relative">
              {getBoardInitials(boardName)}
            </span>
          </div>
        )}
      </div>
    )
  }
  const placeholderBoards = useMemo(() => {
    const placeholders = []
    const placeholderNames = ['Design System', 'User Flow', 'Architecture', 'Marketing Ideas']
    
    for (let i = 0; i < 4; i++) {
      placeholders.push({
        id: `placeholder-${i}`,
        name: placeholderNames[i],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isPlaceholder: true
      })
    }
    
    return placeholders
  }, [])

  async function handleCreate() {
    setCreateError(null)
    try {
      const room = await createWhiteboard()
      navigate(`/whiteboards/${room.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create whiteboard'
      setCreateError(message)
    }
  }

  const pageClassName = isDesktop
    ? 'flex h-[100dvh] flex-col overflow-hidden bg-[#0D0D0D] font-body text-white'
    : 'min-h-[100dvh] bg-[#0D0D0D] font-body text-white'

  return (
    <motion.main
      className={pageClassName}
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[#0D0D0D]/80 backdrop-blur-lg border-b border-[#2A2A2A]">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left: Title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              aria-label="Go home"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1A1A] hover:bg-[#2A2A2A] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Home</span>
            </button>
            <h1 className="text-2xl font-semibold">Whiteboards</h1>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#666]" />
              <input
                type="text"
                placeholder="Search whiteboards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white placeholder-[#666] focus:outline-none focus:border-[#444] transition-colors"
              />
            </div>
          </div>

          {/* Right: Create Button & User Menu */}
          <div className="flex items-center gap-3">
            <button 
              onClick={handleCreate} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F59E0B] hover:bg-[#d97706] transition-colors text-black font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Whiteboard
            </button>
            <ChessUserMenu
              onOpenPhotos={() => navigate('/photos')}
              onOpenEdit={() => navigate('/edit')}
              onOpenAdmin={() => navigate('/admin')}
              showAdminQuickAction={false}
            />
          </div>
        </div>

        {/* Tab Filters */}
        <div className="px-6 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 text-sm font-medium transition-all rounded-md ${
                activeTab === 'all'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-[#666] hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('recent')}
              className={`px-3 py-1 text-sm font-medium transition-all rounded-md ${
                activeTab === 'recent'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-[#666] hover:text-white'
              }`}
            >
              Recent
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto relative">
        {/* Bottom gradient glow */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-96 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 40% at 50% 95%, rgba(245, 158, 11, 0.04) 0%, transparent 70%)'
          }}
        />
        
        {createError && (
          <div className="mx-6 mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {createError}
          </div>
        )}

        <div className="p-6">
          {loading && (
            <div className="text-center text-[#666] py-12">Loading…</div>
          )}
          
          {!loading && filteredBoards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              {/* Empty State SVG Illustration */}
              <div className="w-24 h-24 mb-6">
                <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="#666" strokeWidth="1.5"/>
                  <path d="M9 9h6v6H9z" fill="#666" opacity="0.3"/>
                  <circle cx="12" cy="12" r="1" fill="#666"/>
                  <path d="M16 8l-4 4-4-4" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              
              <h2 className="text-xl font-semibold text-white mb-2">No whiteboards yet</h2>
              <p className="text-[#666] mb-6 text-center max-w-md">
                Create your first whiteboard to get started
              </p>
              <button 
                onClick={handleCreate}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#F59E0B] hover:bg-[#d97706] transition-colors text-black font-medium"
              >
                <Plus className="w-5 h-5" />
                Create Your First Whiteboard
              </button>
            </div>
          )}

          {!loading && filteredBoards.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredBoards.map((board, index) => (
                <WhiteboardCard key={board.id} board={board} index={index} />
              ))}
              {/* Add placeholder cards if we have fewer than 4 real boards */}
              {filteredBoards.length < 4 && placeholderBoards.slice(0, 4 - filteredBoards.length).map((placeholder, index) => (
                <WhiteboardCard 
                  key={placeholder.id} 
                  board={placeholder} 
                  index={filteredBoards.length + index} 
                  isPlaceholder={true}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.main>
  )
}
