import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Plus, Search, MoreVertical, Clock } from 'lucide-react'
import { listMyWhiteboards, createWhiteboard } from '../api/whiteboards'
import { listRoomMembers, RoomMemberDetails } from '../api/chat'
import Avatar from '../components/Avatar'
import ChessUserMenu from '../components/ChessUserMenu'
import { useAuth } from '../contexts/AuthContext'

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
  const getBoardGradient = (name: string): string => {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 70%, 60%)`
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

  // Whiteboard Card Component
  const WhiteboardCard = ({ board, index }: { board: any; index: number }) => {
    const gradient = getBoardGradient(board.name || 'Whiteboard')
    const initials = getBoardInitials(board.name || 'Whiteboard')
    const members = membersByBoard[board.id] || []
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          duration: 0.3, 
          delay: prefersReducedMotion ? 0 : index * 0.05,
          ease: [0.22, 1, 0.36, 1]
        }}
        whileHover={{ 
          y: -4,
          boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.4)',
          transition: { duration: 0.2 }
        }}
        onClick={() => navigate(`/whiteboards/${board.id}`)}
        className="relative bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl cursor-pointer overflow-hidden transition-all duration-200 hover:border-[#444] hover:scale-[1.02]"
        style={{
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}
      >
        {/* Thumbnail Area */}
        <div 
          className="h-40 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${gradient}dd, ${gradient}99)`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-3xl font-bold drop-shadow-lg">
              {initials}
            </span>
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
        
        {/* Content Area */}
        <div className="p-4">
          {/* Title */}
          <h3 className="font-medium text-white text-sm mb-2 truncate">
            {board.name || 'Whiteboard'}
          </h3>
          
          {/* Timestamp */}
          <div className="flex items-center gap-1 text-[#666] text-xs mb-3">
            <Clock className="w-3 h-3" />
            <span>{formatTimestamp(board.updated_at || board.created_at)}</span>
          </div>
          
          {/* Collaborators */}
          <div className="flex items-center justify-between">
            <div className="flex items-center -space-x-2">
              {members.slice(0, 3).map((member, idx) => (
                <div
                  key={member.user_id}
                  className="relative"
                  style={{ zIndex: 3 - idx }}
                >
                  <Avatar
                    src={member.avatar_url || (profile?.id === member.user_id ? profile?.avatar_url : undefined)}
                    username={member.username || null}
                    size={32}
                  />
                </div>
              ))}
              {members.length > 3 && (
                <div 
                  className="w-8 h-8 rounded-full bg-[#2A2A2A] border border-[#444] flex items-center justify-center text-xs text-[#666]"
                  style={{ zIndex: 0 }}
                >
                  +{members.length - 3}
                </div>
              )}
              {members.length === 0 && (
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
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-[#1A1A1A] text-white'
                  : 'text-[#666] hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('recent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'recent'
                  ? 'bg-[#1A1A1A] text-white'
                  : 'text-[#666] hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              Recent
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
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
            </div>
          )}
        </div>
      </div>
    </motion.main>
  )
}
