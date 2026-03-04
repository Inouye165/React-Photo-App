import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Plus, Users } from 'lucide-react'
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
  const [membersByBoard, setMembersByBoard] = useState<Record<string, RoomMemberDetails[]>>({})
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [createError, setCreateError] = useState<string | null>(null)
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
    ? 'flex h-[100dvh] flex-col overflow-hidden bg-chess-bg font-body text-chess-text'
    : 'min-h-[100dvh] bg-chess-bg font-body text-chess-text'

  return (
    <motion.main
      className={pageClassName}
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {isDesktop ? (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/12">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                aria-label="Go home"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Home</span>
              </button>
              <h1 className="text-2xl font-semibold font-display">Whiteboards</h1>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleCreate} 
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-chess-accent hover:bg-chess-accentSoft transition-colors text-white font-medium"
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

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {createError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {createError}
              </div>
            )}

            <div className="rounded-xl border border-white/12 bg-chess-surface p-6 shadow-chess-card">
              {loading && (
                <div className="text-center text-chess-muted py-8">Loading…</div>
              )}
              {!loading && boards.length === 0 && (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto mb-4 text-chess-muted/50" />
                  <h3 className="text-lg font-medium mb-2">No whiteboards yet</h3>
                  <p className="text-chess-muted mb-6">Click "Create Whiteboard" to start collaborating.</p>
                  <button 
                    onClick={handleCreate}
                    className="px-4 py-2 rounded-lg bg-chess-accent hover:bg-chess-accentSoft transition-colors text-white font-medium"
                  >
                    Create Your First Whiteboard
                  </button>
                </div>
              )}

              {!loading && boards.length > 0 && (
                <div className="space-y-3">
                  {boards.map((b) => (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center justify-between rounded-lg border border-white/12 bg-chess-surfaceSoft p-4 hover:bg-chess-surface transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-chess-text truncate mb-1">{b.name ?? 'Whiteboard'}</div>
                        <div className="text-xs text-chess-muted">{new Date(b.created_at).toLocaleString()}</div>
                      </div>

                      <div className="flex items-center gap-3">
                        {membersByBoard[b.id] && membersByBoard[b.id].length > 0 ? (
                          <div className="flex items-center gap-2">
                            {membersByBoard[b.id].slice(0, 4).map((m) => (
                              <div key={m.user_id} title={m.username ?? undefined}>
                                <Avatar
                                  src={m.avatar_url ?? (profile?.id === m.user_id ? profile?.avatar_url ?? undefined : undefined)}
                                  username={m.username ?? null}
                                  size={40}
                                />
                              </div>
                            ))}
                            {membersByBoard[b.id].length > 4 ? (
                              <div className="text-sm text-chess-muted ml-1">+{membersByBoard[b.id].length - 4}</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-xs text-chess-muted">No members</div>
                        )}

                        <button 
                          onClick={() => navigate(`/whiteboards/${b.id}`)} 
                          className="px-3 py-1.5 rounded bg-chess-accent hover:bg-chess-accentSoft transition-colors text-white text-sm font-medium"
                        >
                          Open
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-[100dvh]">
          {/* Mobile Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/12">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                aria-label="Go home"
                className="p-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-xl font-semibold font-display">Whiteboards</h1>
            </div>
            <ChessUserMenu
              onOpenPhotos={() => navigate('/photos')}
              onOpenEdit={() => navigate('/edit')}
              onOpenAdmin={() => navigate('/admin')}
              showAdminQuickAction={false}
            />
          </div>

          {/* Mobile Content */}
          <div className="p-4">
            {createError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {createError}
              </div>
            )}

            <div className="rounded-xl border border-white/12 bg-chess-surface p-4 shadow-chess-card">
              {loading && (
                <div className="text-center text-chess-muted py-8">Loading…</div>
              )}
              {!loading && boards.length === 0 && (
                <div className="text-center py-8">
                  <Users className="w-10 h-10 mx-auto mb-3 text-chess-muted/50" />
                  <h3 className="text-base font-medium mb-2">No whiteboards yet</h3>
                  <p className="text-sm text-chess-muted mb-4">Create your first whiteboard to start collaborating.</p>
                  <button 
                    onClick={handleCreate}
                    className="w-full px-4 py-2 rounded-lg bg-chess-accent hover:bg-chess-accentSoft transition-colors text-white font-medium"
                  >
                    Create Whiteboard
                  </button>
                </div>
              )}

              {!loading && boards.length > 0 && (
                <div className="space-y-3">
                  <button 
                    onClick={handleCreate}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-chess-accent hover:bg-chess-accentSoft transition-colors text-white font-medium mb-4"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Whiteboard
                  </button>
                  
                  {boards.map((b) => (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-3 rounded-lg border border-white/12 bg-chess-surfaceSoft p-4 hover:bg-chess-surface transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-chess-text truncate mb-1">{b.name ?? 'Whiteboard'}</div>
                          <div className="text-xs text-chess-muted">{new Date(b.created_at).toLocaleString()}</div>
                        </div>
                        <button 
                          onClick={() => navigate(`/whiteboards/${b.id}`)} 
                          className="px-3 py-1.5 rounded bg-chess-accent hover:bg-chess-accentSoft transition-colors text-white text-sm font-medium flex-shrink-0"
                        >
                          Open
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {membersByBoard[b.id] && membersByBoard[b.id].length > 0 ? (
                          <>
                            <div className="flex items-center gap-1">
                              {membersByBoard[b.id].slice(0, 3).map((m) => (
                                <div key={m.user_id} title={m.username ?? undefined}>
                                  <Avatar
                                    src={m.avatar_url ?? (profile?.id === m.user_id ? profile?.avatar_url ?? undefined : undefined)}
                                    username={m.username ?? null}
                                    size={32}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="text-xs text-chess-muted">
                              {membersByBoard[b.id].length === 1 
                                ? '1 member' 
                                : `${membersByBoard[b.id].length} members`
                              }
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-chess-muted">No members</div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.main>
  )
}
