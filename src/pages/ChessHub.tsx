import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { motion, useReducedMotion } from 'framer-motion'
import { Bot, BookOpen, Users, type LucideIcon } from 'lucide-react'
import { listMyGamesWithMembers, type GameWithMembers } from '../api/games'
import { onGamesChanged } from '../events/gamesEvents'
import { useAuth } from '../contexts/AuthContext'
import ChessHubMobile from './ChessHubMobile'
import ChessHubDesktopLayout from './ChessHubDesktopLayout'

const inviteStatuses = new Set(['waiting', 'invited', 'pending'])
const activeStatuses = new Set(['active', 'in_progress', 'inprogress'])

function normalizeStatus(status: string | null | undefined): string {
  return (status || '').toLowerCase()
}

function isOpenStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status)
  return inviteStatuses.has(normalized) || activeStatuses.has(normalized)
}

function isInviteStatus(status: string | null | undefined): boolean {
  return inviteStatuses.has(normalizeStatus(status))
}

function getTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

function byUpdatedDesc(a: GameWithMembers, b: GameWithMembers): number {
  return getTimestamp(b.updated_at) - getTimestamp(a.updated_at)
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return formatDistanceToNow(date, { addSuffix: true })
}

function getOpponentLabel(game: GameWithMembers, currentUserId?: string, currentUsername?: string): string {
  const currentId = currentUserId || ''
  const currentName = (currentUsername || '').trim().toLowerCase()

  const opponent = game.members.find((member) => {
    if (currentId && member.user_id === currentId) return false
    if (!currentId && currentName && (member.username || '').trim().toLowerCase() === currentName) return false
    return true
  })

  return opponent?.username || 'Opponent'
}

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

type ModeItem = {
  key: string
  title: string
  description: string
  chips: string[]
  onClick: () => void
  icon: LucideIcon
}

export default function ChessHub(): React.JSX.Element {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const [games, setGames] = useState<GameWithMembers[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const isDesktop = useDesktopLayout()

  const loadGames = useCallback(async (showLoading: boolean) => {
    if (showLoading) setIsLoading(true)
    setLoadError(null)

    try {
      const rows = await listMyGamesWithMembers()
      setGames(Array.isArray(rows) ? rows : [])
    } catch {
      setLoadError('Unable to load your recent chess games right now.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const runInitialLoad = async () => {
      try {
        const rows = await listMyGamesWithMembers()
        if (!isMounted) return
        setGames(Array.isArray(rows) ? rows : [])
        setLoadError(null)
      } catch {
        if (!isMounted) return
        setLoadError('Unable to load your recent chess games right now.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void runInitialLoad()

    const offGamesChanged = onGamesChanged(() => {
      void loadGames(false)
    })

    return () => {
      isMounted = false
      offGamesChanged()
    }
  }, [loadGames])

  // Human decision: API does not expose turn-owner, so the top active match is treated as the actionable "Your Turn" hero target.
  const activeGames = useMemo(() => (
    games
      .filter((game) => activeStatuses.has(normalizeStatus(game.status)))
      .sort(byUpdatedDesc)
  ), [games])

  const singleActiveGame = activeGames[0] ?? null

  const heroState = useMemo<'hasActiveGame' | 'hasMultipleActiveGames' | 'noActiveGame'>(() => {
    if (activeGames.length === 1) return 'hasActiveGame'
    if (activeGames.length >= 2) return 'hasMultipleActiveGames'
    return 'noActiveGame'
  }, [activeGames.length])

  const historyGames = useMemo(() => {
    const activeIds = new Set(activeGames.map((game) => game.id))
    return games
      .filter((game) => game?.id && !activeIds.has(game.id) && isOpenStatus(game.status))
      .sort(byUpdatedDesc)
      .slice(0, 8)
  }, [activeGames, games])

  const modeItems: ModeItem[] = [
    {
      key: 'local',
      title: 'Play Computer',
      description: 'Sharpen openings with immediate feedback and rematch speed.',
      chips: ['Engine Support', 'Practice Scenarios', 'Instant Rematch'],
      onClick: () => navigate('/games/local?tab=analyze'),
      icon: Bot,
    },
    {
      key: 'invite',
      title: 'Play a Friend',
      description: 'Set up a serious match and keep momentum across turns.',
      chips: ['Invite Match', 'Live Opponent', 'Match Continuity'],
      onClick: () => navigate('/games'),
      icon: Users,
    },
    {
      key: 'tutorials',
      title: 'Learn Chess',
      description: 'Build pattern recognition with guided lessons and stories.',
      chips: ['Guided Lessons', 'Story Chapters', 'Focused Drills'],
      onClick: () => navigate('/games/local?tab=lesson&tutor=1&storyId=architect-of-squares'),
      icon: BookOpen,
    },
  ]

  const currentUsername = profile?.username || user?.email || ''
  const getOpponentLabelForCurrentUser = useCallback((game: GameWithMembers) => (
    getOpponentLabel(game, user?.id, currentUsername)
  ), [currentUsername, user?.id])

  return (
    <motion.main
      className="min-h-[100dvh] bg-chess-bg font-body text-chess-text"
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {isDesktop ? (
        <ChessHubDesktopLayout
          isLoading={isLoading}
          loadError={loadError}
          onRetry={() => { void loadGames(true) }}
          modeItems={modeItems}
          singleActiveGame={singleActiveGame}
          activeGames={activeGames}
          historyGames={historyGames}
          getOpponentLabel={getOpponentLabelForCurrentUser}
          formatRelative={formatRelative}
          isInviteStatus={isInviteStatus}
          onOpenHome={() => navigate('/')}
          onOpenGame={(gameId) => navigate(`/games/${gameId}`)}
        />
      ) : (
        <ChessHubMobile
          isLoading={isLoading}
          loadError={loadError}
          heroState={heroState}
          singleActiveGame={singleActiveGame}
          activeGames={activeGames}
          historyGames={historyGames}
          isHistoryOpen={isHistoryOpen}
          modeItems={modeItems}
          prefersReducedMotion={Boolean(prefersReducedMotion)}
          getOpponentLabel={getOpponentLabelForCurrentUser}
          formatRelative={formatRelative}
          isInviteStatus={isInviteStatus}
          onRetry={() => { void loadGames(true) }}
          onOpenHome={() => navigate('/')}
          onOpenMode={(callback) => callback()}
          onOpenGame={(gameId) => navigate(`/games/${gameId}`)}
          onToggleHistory={() => setIsHistoryOpen((prev) => !prev)}
        />
      )}
    </motion.main>
  )
}