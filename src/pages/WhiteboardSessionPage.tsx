import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  Circle,
  Copy,
  Edit3,
  Eraser,
  Highlighter,
  ImageMinus,
  MapPin,
  MoreVertical,
  PenTool,
  Share2,
  Square,
  Trash2,
  Type,
  Users,
} from 'lucide-react'
import TutorOverlay from '../components/whiteboard/TutorOverlay'
import useTutorPlayback from '../components/whiteboard/useTutorPlayback'
import type { TutorLessonMessage } from '../components/whiteboard/tabs/AITutorTab'
import type { WhiteboardBoardFrame } from '../components/whiteboard/types'
import WhiteboardPad from '../components/whiteboard/WhiteboardPad'
import type {
  AnnotationTool,
  BackgroundImageAsset,
  BackgroundInfo,
  WhiteboardCanvasHandle,
} from '../components/whiteboard/WhiteboardCanvas'
import RightSidePanel, { type BoardActionContext as RightSidePanelBoardActionContext, type TabType } from '../components/whiteboard/RightSidePanel'
import { AITutorTab, ChatTab, HelpRequestTab } from '../components/whiteboard/tabs'
import {
  analyzeWhiteboardPhoto,
  createWhiteboardHelpRequest,
  createWhiteboardInvite,
  ensureWhiteboardMembership,
  getActiveWhiteboardHelpRequest,
  getWhiteboardSessionDetails,
  updateWhiteboardTitle,
} from '../api/whiteboards'
import { addRoomMember, listRoomMembers, searchUsers, type UserSearchResult } from '../api/chat'
import ChessUserMenu from '../components/ChessUserMenu'
import { useAuth } from '../contexts/AuthContext'
import RoomMembersModal, { type RoomMemberSummary } from '../components/rooms/RoomMembersModal'
import type { WhiteboardHelpRequest, WhiteboardTutorMessage, WhiteboardTutorResponse } from '../types/whiteboard'
import { buildTutorAnalysisDeviceCacheKey, readTutorAnalysisDeviceCache, writeTutorAnalysisDeviceCache } from '../utils/tutorAnalysisCache'

type RealtimeStatus = 'connected' | 'connecting' | 'offline'
type SessionState = 'queued' | 'live' | 'async'
type ShapeTool = Extract<AnnotationTool, 'arrow' | 'rectangle' | 'ellipse'>
type MobileWhiteboardTab = 'homework' | 'support' | 'chat'
type HomeworkInputMode = 'photo' | 'text'
type FormattedProblemLineType = 'question' | 'data' | 'section' | 'context' | 'empty'
type PhotoTransformState = {
  rotation: 0 | 90 | 180 | 270
  scale: number
  flipX: boolean
  flipY: boolean
  panX: number
  panY: number
}
const WHITEBOARD_APP_NAME = 'HomeworkHelper'
const PHOTO_GUIDANCE_DISMISSED_KEY = 'photoGuidanceDismissed'
const DEFAULT_PHOTO_TRANSFORM: PhotoTransformState = {
  rotation: 0,
  scale: 1,
  flipX: false,
  flipY: false,
  panX: 0,
  panY: 0,
}
const TEXT_MODE_PLACEHOLDER = 'The Weekend Problem\n\nSara has 3 apples...\n\nHow many apples does she have left?'

type FormattedProblemLine = {
  id: string
  type: FormattedProblemLineType
  text: string
}

function getSafeErrorDetails(error: unknown): { code: string | null; status: number | null; message: string } {
  if (!error || typeof error !== 'object') {
    return {
      code: null,
      status: null,
      message: typeof error === 'string' ? error : 'Unable to invite this member.',
    }
  }

  const candidate = error as {
    code?: unknown
    status?: unknown
    message?: unknown
  }

  return {
    code: typeof candidate.code === 'string' ? candidate.code : null,
    status: typeof candidate.status === 'number' ? candidate.status : null,
    message: typeof candidate.message === 'string' ? candidate.message : 'Unable to invite this member.',
  }
}

function buildNextMessages(messages: WhiteboardTutorMessage[], draft: string): WhiteboardTutorMessage[] {
  return [...messages, { role: 'user', content: draft.trim() }]
}

function buildInitialTutorMessages(
  intent: 'analyze' | 'solve' | 'steps',
  helpRequest: string,
  includeHelpRequest: boolean,
): WhiteboardTutorMessage[] {
  const intentPrompt = intent === 'solve'
    ? 'Please help me solve this without jumping straight to the final answer.'
    : intent === 'steps'
      ? 'Please explain this one step at a time so I can work along on the board.'
      : 'Please analyze what is here and tell me the best next thing to focus on.'

  const parts = [intentPrompt]
  const trimmedHelpRequest = helpRequest.trim()
  if (includeHelpRequest && trimmedHelpRequest) {
    parts.push(trimmedHelpRequest)
  }

  return parts.length > 0 ? [{ role: 'user', content: parts.join('\n\n') }] : []
}

function parseAudienceAge(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 20) {
    return undefined
  }

  return parsed
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function classifyProblemLine(line: string): FormattedProblemLineType {
  const trimmed = line.trim()
  if (!trimmed) return 'empty'
  if (trimmed.endsWith('?')) return 'question'

  const hasCurrency = trimmed.includes('$')
  const hasNumberWithUnit = /\b\d+(?:\.\d+)?\s?(?:cm|mm|m|km|kg|g|lb|lbs|oz|hour|hours|hr|hrs|minute|minutes|min|mins|day|days|week|weeks|month|months|year|years|apple|apples|orange|oranges|dollar|dollars|cent|cents|meter|meters|mile|miles|ft|feet|inch|inches|%|mph|km\/h)\b/i.test(trimmed)
  const hasDataKeyword = /\b(costs|sells|has|buys)\b/i.test(trimmed)
  if (hasCurrency || hasNumberWithUnit || hasDataKeyword) return 'data'

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  if (wordCount > 0 && wordCount < 6 && !/\d/.test(trimmed)) return 'section'

  return 'context'
}

function buildFormattedProblemLines(rawText: string): FormattedProblemLine[] {
  return rawText.split(/\r?\n/).map((line, index) => ({
    id: `${index}-${line}`,
    type: classifyProblemLine(line),
    text: line,
  }))
}

function getFriendlyTutorErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    const lowerMessage = error.message.toLowerCase()
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
      return 'The tutor could not connect just now. Please try again.'
    }
    if (lowerMessage.includes('too large') || lowerMessage.includes('payload')) {
      return 'That photo was a little too large to read safely. Try a smaller or clearer image.'
    }
  }

  return fallback
}

function logTutorAnalysisSource(
  source: WhiteboardTutorResponse['cacheSource'],
  details: {
    boardId?: string
    mode: 'analysis' | 'tutor' | 'chat'
    inputMode: HomeworkInputMode
  },
): void {
  console.info('[WB-TUTOR] assistant-data-source', {
    boardId: details.boardId ?? null,
    source: source ?? 'fresh',
    mode: details.mode,
    inputMode: details.inputMode,
  })
}

function ToolButton({
  active,
  label,
  onClick,
  icon,
  compact = false,
  className = '',
}: {
  active: boolean
  label: string
  onClick: () => void
  icon: React.JSX.Element
  compact?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[8px] font-medium transition ${compact ? 'px-2.5 py-2 text-[13px]' : 'px-3 py-2 text-sm'} ${className} ${
        active ? 'bg-amber-500 text-slate-950' : 'bg-chess-surface text-white hover:bg-amber-500/12 hover:text-chess-accentSoft'
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
    </button>
  )
}

function useIsMobileWhiteboardLayout(): boolean {
  const [isMobileLayout, setIsMobileLayout] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 768
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)')
      : null

    const updateLayout = () => {
      setIsMobileLayout(mediaQuery ? mediaQuery.matches : window.innerWidth < 768)
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

  return isMobileLayout
}

export default function WhiteboardSessionPage(): React.JSX.Element {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const isMobileLayout = useIsMobileWhiteboardLayout()
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [boardName, setBoardName] = useState<string>(WHITEBOARD_APP_NAME)
  const [members, setMembers] = useState<RoomMemberSummary[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const [joinLinkNotice, setJoinLinkNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState(WHITEBOARD_APP_NAME)
  const [isSavingRename, setIsSavingRename] = useState(false)
  const [isCreatingJoinLink, setIsCreatingJoinLink] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')
  const [inputMode, setInputMode] = useState<HomeworkInputMode>('photo')
  const [textContent, setTextContent] = useState('')
  const [formattedProblemLines, setFormattedProblemLines] = useState<FormattedProblemLine[]>([])
  const [isTextInputFocused, setIsTextInputFocused] = useState(false)
  const [hasBackground, setHasBackground] = useState(false)
  const [hasBoardContent, setHasBoardContent] = useState(false)
  const [backgroundInfo, setBackgroundInfo] = useState<BackgroundInfo | null>(null)
  const [boardFrame, setBoardFrame] = useState<WhiteboardBoardFrame | null>(null)
  const [backgroundImageAsset, setBackgroundImageAsset] = useState<BackgroundImageAsset | null>(null)
  const [mobilePhotoObjectUrl, setMobilePhotoObjectUrl] = useState<string | null>(null)
  const [mobilePhotoVersion, setMobilePhotoVersion] = useState(0)
  const [mobilePhotoContainerHeight, setMobilePhotoContainerHeight] = useState<number | null>(null)
  const [photoTransform, setPhotoTransform] = useState<PhotoTransformState>(DEFAULT_PHOTO_TRANSFORM)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotationMarkers] = useState([
    { id: 1, x: 45, y: 35, label: '①', color: '#EF4444' },
    { id: 2, x: 45, y: 55, label: '②', color: '#F59E0B' },
  ])
  const [zoomLevel, setZoomLevel] = useState(100)
  const [analysis, setAnalysis] = useState<WhiteboardTutorResponse | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [activeHelpRequest, setActiveHelpRequest] = useState<WhiteboardHelpRequest | null>(null)
  const [helpRequestSubmitting, setHelpRequestSubmitting] = useState(false)
  const [helpRequestError, setHelpRequestError] = useState<string | null>(null)
  const [tutorOverlayVisible, setTutorOverlayVisible] = useState(true)
  const [tutorLessonMessage, setTutorLessonMessage] = useState<TutorLessonMessage | null>(null)
  const [responseAge, setResponseAge] = useState('')
  const [helpRequestDraft, setHelpRequestDraft] = useState('')
  const [tutorDraft, setTutorDraft] = useState('')
  const [tutorReadyIntent, setTutorReadyIntent] = useState<'analyze' | 'solve' | 'steps'>('analyze')
  const [tutorSubmitting, setTutorSubmitting] = useState(false)
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('pen')
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState(false)
  const [mobileToolbarVisible, setMobileToolbarVisible] = useState(false)
  const [desktopSidePanelOpen, setDesktopSidePanelOpen] = useState(false)
  const [desktopSidePanelTab, setDesktopSidePanelTab] = useState<TabType>('steps')
  const [activeBoardActionContext, setActiveBoardActionContext] = useState<RightSidePanelBoardActionContext | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>('queued')
  const [liveSessionStartedAt, setLiveSessionStartedAt] = useState<number | null>(null)
  const [liveSessionElapsedSeconds, setLiveSessionElapsedSeconds] = useState(0)
  const [studentPresence, setStudentPresence] = useState<'online' | 'offline'>('offline')
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileWhiteboardTab>('homework')
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false)
  const [photoGuidanceVisible, setPhotoGuidanceVisible] = useState(false)
  const [photoGuidanceFading, setPhotoGuidanceFading] = useState(false)
  const inviteDeniedLoggedRef = useRef(false)
  const whiteboardPadRef = useRef<WhiteboardCanvasHandle>(null)
  const mobilePhotoContainerRef = useRef<HTMLDivElement | null>(null)
  const mobileTextInputRef = useRef<HTMLTextAreaElement | null>(null)
  const mobileFormattedOverlayRef = useRef<HTMLDivElement | null>(null)
  const photoUploadInputRef = useRef<HTMLInputElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const shareMenuRef = useRef<HTMLDivElement | null>(null)
  const mobileOverflowRef = useRef<HTMLDivElement | null>(null)
  const shapeMenuRef = useRef<HTMLDivElement | null>(null)
  const hasBackgroundRef = useRef(false)
  const lastBackgroundAssetSignatureRef = useRef<string | null>(null)
  const mobileToolbarHideTimeoutRef = useRef<number | null>(null)
  const formatProblemTextTimeoutRef = useRef<number | null>(null)
  const touchPanStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const prefersReducedMotion = useReducedMotion()

  const currentUserId = user?.id ?? null
  const canUseTutorAssist = user?.app_metadata?.role === 'admin' || user?.app_metadata?.is_tutor === true || profile?.is_tutor === true
  const panelMode: 'student' | 'tutor' = canUseTutorAssist ? 'tutor' : 'student'
  const isTutorView = panelMode === 'tutor'
  const audienceAge = useMemo(() => parseAudienceAge(responseAge), [responseAge])
  const responseAgeInvalid = responseAge.trim().length > 0 && audienceAge === undefined
  const structuredAnalysisResult = analysis?.analysisResult ?? null
  const displayBoardName = useMemo(() => boardName.trim() || WHITEBOARD_APP_NAME, [boardName])
  const studentMember = useMemo(
    () => members.find((member) => member.userId !== currentUserId) ?? members[0] ?? null,
    [currentUserId, members],
  )
  const studentDisplayName = useMemo(() => studentMember?.username?.trim() || 'Student', [studentMember])
  const hasHelpRequest = helpRequestDraft.trim().length > 0
  const hasTextInput = textContent.trim().length > 0
  const effectiveTutorInputMode: HomeworkInputMode = inputMode === 'text' || (!hasBackground && (hasTextInput || hasHelpRequest)) ? 'text' : 'photo'
  const hasTutorInput = hasBackground || hasTextInput || hasHelpRequest
  const tutorAnalysisDeviceCacheKey = useMemo(() => buildTutorAnalysisDeviceCacheKey({
    boardId,
    inputMode: effectiveTutorInputMode,
    audienceAge,
    textContent: effectiveTutorInputMode === 'text' ? (textContent.trim() || helpRequestDraft.trim()) : textContent.trim(),
    imageDataUrl: backgroundImageAsset?.dataUrl,
    imageMimeType: backgroundImageAsset?.mimeType,
    imageName: backgroundImageAsset?.name,
  }), [audienceAge, backgroundImageAsset?.dataUrl, backgroundImageAsset?.mimeType, backgroundImageAsset?.name, boardId, effectiveTutorInputMode, helpRequestDraft, textContent])
  const mobileSupportLabel = canUseTutorAssist ? 'Tutor Assist' : 'Help'
  const showFormattedProblemOverlay = !isTextInputFocused && formattedProblemLines.length > 0
  const tutorPlayback = useTutorPlayback({
    steps: structuredAnalysisResult?.steps ?? [],
    reducedMotion: Boolean(prefersReducedMotion),
  })

  const sessionStatusMeta = useMemo(() => {
    if (isTutorView) {
      if (sessionState === 'live') {
        return {
          pillClassName: 'bg-[#064E3B] text-[#10B981]',
          pillText: '● Live Session',
        }
      }

      if (sessionState === 'async') {
        return {
          pillClassName: 'bg-[#1E3A5F] text-[#60A5FA]',
          pillText: '📋 Async Review',
        }
      }

      return {
        pillClassName: 'bg-[#78350F] text-[#F59E0B]',
        pillText: '⏳ In Queue',
      }
    }

    if (sessionState === 'live') {
      return {
        pillClassName: 'bg-[#064E3B] text-[#6EE7B7]',
        pillText: '● Tutor Connected',
      }
    }

    if (sessionState === 'async') {
      return {
        pillClassName: 'bg-[#1E3A5F] text-[#93C5FD]',
        pillText: '📋 Review In Progress',
      }
    }

    return {
      pillClassName: 'bg-[#172554] text-[#93C5FD]',
      pillText: '💬 Help Request Sent',
    }
  }, [isTutorView, sessionState])

  const sessionSummaryText = useMemo(() => {
    if (isTutorView) {
      return 'Student submitted 23 minutes ago  ·  Algebra  ·  Grade 9'
    }

    if (sessionState === 'live') {
      return `${studentDisplayName} is working here with a tutor  ·  Algebra  ·  Grade 9`
    }

    if (sessionState === 'async') {
      return 'Your work is saved for tutor follow-up  ·  Algebra  ·  Grade 9'
    }

    return 'A tutor will join here when one is available  ·  Algebra  ·  Grade 9'
  }, [isTutorView, sessionState, studentDisplayName])

  const studentSessionAside = useMemo(() => {
    if (sessionState === 'live') return 'Working together now'
    if (sessionState === 'async') return 'Tutor review pending'
    return 'Waiting for tutor'
  }, [sessionState])

  const liveSessionTimerLabel = useMemo(() => {
    const minutes = Math.floor(liveSessionElapsedSeconds / 60)
    const seconds = liveSessionElapsedSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }, [liveSessionElapsedSeconds])

  const statusNotice = useMemo(() => {
    if (realtimeStatus === 'offline') {
      return { tone: 'error' as const, message: 'Realtime sync is offline. Changes will reconnect when the session recovers.' }
    }
    if (realtimeStatus === 'connecting') {
      return { tone: 'info' as const, message: 'Connecting to collaborators…' }
    }
    return null
  }, [realtimeStatus])

  const refreshMembers = useCallback(async () => {
    if (!boardId) return

    const [room, memberRows] = await Promise.all([getWhiteboardSessionDetails(boardId), listRoomMembers(boardId)])
    const createdBy = typeof room?.created_by === 'string' ? room.created_by : null
    const resolvedName = typeof room?.name === 'string' && room.name.trim() ? room.name.trim() : WHITEBOARD_APP_NAME

    setBoardName(resolvedName)
    setRenameDraft(resolvedName)

    const nextMembers: RoomMemberSummary[] = memberRows.map((member) => ({
      userId: member.user_id,
      username: member.username,
      avatarUrl: member.avatar_url,
      isOwner: member.is_owner,
    }))
    setMembers(nextMembers)

    const me = currentUserId ? memberRows.find((member) => member.user_id === currentUserId) ?? null : null
    const ownerFromMembership = Boolean(me?.is_owner)
    const ownerFromCreator = Boolean(currentUserId && createdBy && currentUserId === createdBy)
    setIsOwner(ownerFromMembership || ownerFromCreator)
  }, [boardId, currentUserId])

  const runTutorRequest = useCallback(
    async (
      messages: WhiteboardTutorMessage[] = [],
      mode: 'analysis' | 'tutor' | 'chat' = 'analysis',
      options?: { forceFresh?: boolean },
    ) => {
      if (!boardId) throw new Error('Missing board id')

      if (mode === 'analysis' && !options?.forceFresh) {
        const cachedResponse = readTutorAnalysisDeviceCache(tutorAnalysisDeviceCacheKey)
        if (cachedResponse) {
          logTutorAnalysisSource(cachedResponse.cacheSource, {
            boardId,
            mode,
            inputMode: effectiveTutorInputMode,
          })
          return cachedResponse
        }
      }

      let response: WhiteboardTutorResponse

      if (effectiveTutorInputMode === 'text') {
        const textSource = textContent.trim() || helpRequestDraft.trim()
        if (!textSource) throw new Error('Type or paste a problem first.')

        response = await analyzeWhiteboardPhoto(boardId, {
          inputMode: 'text',
          textContent: textSource,
          audienceAge,
          messages,
          mode,
          skipCache: Boolean(options?.forceFresh),
        })
      } else {
        if (!backgroundImageAsset) throw new Error('Import a photo first.')

        response = await analyzeWhiteboardPhoto(boardId, {
          inputMode: 'photo',
          imageDataUrl: backgroundImageAsset.dataUrl,
          imageMimeType: backgroundImageAsset.mimeType,
          imageName: backgroundImageAsset.name,
          textContent: textContent.trim() || undefined,
          audienceAge,
          messages,
          mode,
          skipCache: Boolean(options?.forceFresh),
        })
      }

      if (mode === 'analysis') {
        writeTutorAnalysisDeviceCache(tutorAnalysisDeviceCacheKey, response)
      }

      logTutorAnalysisSource(response.cacheSource, {
        boardId,
        mode,
        inputMode: effectiveTutorInputMode,
      })

      return response
    },
    [audienceAge, backgroundImageAsset, boardId, effectiveTutorInputMode, helpRequestDraft, textContent, tutorAnalysisDeviceCacheKey],
  )

  const resetPhotoTransform = useCallback(() => {
    setPhotoTransform(DEFAULT_PHOTO_TRANSFORM)
  }, [])

  const clampPhotoPan = useCallback((panX: number, panY: number, nextScale: number) => {
    const container = mobilePhotoContainerRef.current
    if (!container || nextScale <= 1) {
      return { panX: 0, panY: 0 }
    }

    const maxOffsetX = Math.max(0, ((container.clientWidth * nextScale) - container.clientWidth) / 2)
    const maxOffsetY = Math.max(0, ((container.clientHeight * nextScale) - container.clientHeight) / 2)

    return {
      panX: clampNumber(panX, -maxOffsetX, maxOffsetX),
      panY: clampNumber(panY, -maxOffsetY, maxOffsetY),
    }
  }, [])

  const updateMobilePhotoContainerHeight = useCallback(() => {
    const container = mobilePhotoContainerRef.current
    if (!container || !isMobileLayout || mobileActiveTab !== 'homework' || inputMode !== 'photo') return

    const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 52
    const tabBarHeight = document.querySelector('.tab-bar')?.getBoundingClientRect().height ?? 60
    const availableHeight = window.innerHeight - headerHeight - tabBarHeight

    container.style.height = `${availableHeight}px`
    setMobilePhotoContainerHeight(availableHeight)
  }, [inputMode, isMobileLayout, mobileActiveTab])

  const handleResponseAgeChange = useCallback((value: string) => {
    const normalized = value.replace(/[^\d]/g, '').slice(0, 2)
    setResponseAge(normalized)
  }, [])

  const formatProblemText = useCallback((rawText: string) => {
    const trimmed = rawText.trim()
    if (!trimmed) {
      setFormattedProblemLines([])
      return
    }

    setFormattedProblemLines(buildFormattedProblemLines(rawText))
  }, [])

  const scheduleFormatProblemText = useCallback((rawText: string) => {
    if (formatProblemTextTimeoutRef.current !== null) {
      window.clearTimeout(formatProblemTextTimeoutRef.current)
    }

    formatProblemTextTimeoutRef.current = window.setTimeout(() => {
      formatProblemText(rawText)
      formatProblemTextTimeoutRef.current = null
    }, 300)
  }, [formatProblemText])

  const syncFormattedOverlayScroll = useCallback((scrollTop: number) => {
    if (mobileFormattedOverlayRef.current) {
      mobileFormattedOverlayRef.current.scrollTop = scrollTop
    }
  }, [])

  const openDesktopSidePanel = useCallback((tab?: TabType) => {
    if (tab) {
      setDesktopSidePanelTab(tab)
    }
    setDesktopSidePanelOpen(true)
  }, [])

  const handleOpenTutorQueue = useCallback(() => {
    navigate('/tutor/queue')
  }, [navigate])

  const handlePickUpSession = useCallback(() => {
    const startedAt = Date.now() - ((4 * 60) + 23) * 1000
    setSessionState('live')
    setLiveSessionStartedAt(startedAt)
    setLiveSessionElapsedSeconds(4 * 60 + 23)
    setStudentPresence('online')
    setDesktopSidePanelOpen(true)
  }, [])

  const handlePassSession = useCallback(() => {
    setSessionState('async')
    setLiveSessionStartedAt(null)
    setLiveSessionElapsedSeconds(0)
    setStudentPresence('offline')
  }, [])

  const handleRequestHelp = useCallback(() => {
    if (canUseTutorAssist) {
      setTutorReadyIntent('analyze')
      openDesktopSidePanel('ai-tutor')
      return
    }

    openDesktopSidePanel('help-request')
  }, [canUseTutorAssist, openDesktopSidePanel])

  const handleSubmitHelpRequest = useCallback(async () => {
    if (!boardId || canUseTutorAssist) return

    setHelpRequestSubmitting(true)
    setHelpRequestError(null)
    try {
      const created = await createWhiteboardHelpRequest(boardId, {
        requestText: helpRequestDraft.trim(),
        problemDraft: textContent.trim(),
      })
      setActiveHelpRequest(created)
      if (created.requestText) {
        setHelpRequestDraft(created.requestText)
      }
      setDesktopSidePanelOpen(true)
      setDesktopSidePanelTab('help-request')
      setMobileActiveTab('support')
    } catch (error) {
      setHelpRequestError(error instanceof Error ? error.message : 'Unable to send help request.')
    } finally {
      setHelpRequestSubmitting(false)
    }
  }, [boardId, canUseTutorAssist, helpRequestDraft, textContent])

  const scheduleMobileToolbarHide = useCallback(() => {
    if (mobileToolbarHideTimeoutRef.current) {
      window.clearTimeout(mobileToolbarHideTimeoutRef.current)
    }

    mobileToolbarHideTimeoutRef.current = window.setTimeout(() => {
      setMobileToolbarVisible(false)
    }, 4000)
  }, [])

  const handleAnnotationToolSelect = useCallback((tool: AnnotationTool) => {
    setAnnotationTool(tool)
    setShapeMenuOpen(false)
    whiteboardPadRef.current?.setAnnotationTool(tool)
    if (isMobileLayout) {
      scheduleMobileToolbarHide()
    }
  }, [isMobileLayout, scheduleMobileToolbarHide])

  const applyAnalysisResponse = useCallback((response: WhiteboardTutorResponse) => {
    setAnalysis(response)
    setTutorOverlayVisible(true)
    handleAnnotationToolSelect('pen')
  }, [handleAnnotationToolSelect])

  const analyzeText = useCallback(async (rawText: string, messages: WhiteboardTutorMessage[] = [], options?: { forceFresh?: boolean }) => {
    if (!boardId) throw new Error('Missing board id')

    const trimmedText = rawText.trim()
    if (!trimmedText) throw new Error('Type or paste a problem first.')

    const response = await runTutorRequest(messages, 'analysis', options)

    applyAnalysisResponse(response)
  }, [applyAnalysisResponse, boardId, runTutorRequest])

  const handleCopyBoardLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setJoinLinkNotice({ tone: 'success', message: 'Board link copied to clipboard.' })
    } catch {
      setJoinLinkNotice({ tone: 'error', message: 'Unable to copy the board link.' })
    } finally {
      setShareMenuOpen(false)
    }
  }, [])

  const handleCreateJoinLink = useCallback(async () => {
    if (!boardId) {
      setJoinLinkNotice({ tone: 'error', message: 'Missing whiteboard id.' })
      setShareMenuOpen(false)
      return
    }

    if (!isOwner) {
      setJoinLinkNotice({ tone: 'error', message: 'Only the owner can create a join link.' })
      setShareMenuOpen(false)
      return
    }

    setIsCreatingJoinLink(true)
    setJoinLinkNotice(null)

    try {
      const result = await createWhiteboardInvite(boardId)
      let copied = false

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(result.joinUrl)
          copied = true
        } catch {
          copied = false
        }
      }

      const expiresLabel = new Date(result.expiresAt).toLocaleString()
      setJoinLinkNotice({
        tone: 'success',
        message: copied
          ? `Join link copied to clipboard. Expires ${expiresLabel}.`
          : `Join link created. Expires ${expiresLabel}.`,
      })
    } catch (error) {
      const details = getSafeErrorDetails(error)
      if (details.status === 403) {
        setJoinLinkNotice({ tone: 'error', message: 'Only the owner can create a join link for this board.' })
      } else {
        setJoinLinkNotice({ tone: 'error', message: details.message || 'Unable to create join link.' })
      }
    } finally {
      setIsCreatingJoinLink(false)
      setShareMenuOpen(false)
    }
  }, [boardId, isOwner])

  const handleOpenInvite = useCallback(() => {
    if (isOwner) {
      setInviteNotice(null)
      setInviteOpen(true)
      return
    }

    setInviteNotice('Only the owner can invite.')
    if (!inviteDeniedLoggedRef.current) {
      inviteDeniedLoggedRef.current = true
      console.info('[WB-INVITE] invite-denied not-owner', { boardId })
    }
  }, [boardId, isOwner])

  const handleInviteMember = useCallback(async (userId: string) => {
    if (!boardId) {
      throw new Error('Missing whiteboard id')
    }

    try {
      await addRoomMember(boardId, userId)
      await refreshMembers()
    } catch (error) {
      const details = getSafeErrorDetails(error)
      console.warn('[WB-INVITE] invite-failed', {
        boardId,
        userId,
        code: details.code,
        status: details.status,
        message: details.message,
      })
      throw new Error(details.message)
    }
  }, [boardId, refreshMembers])

  const handleSearchUsers = useCallback(async (query: string): Promise<UserSearchResult[]> => {
    return searchUsers(query)
  }, [])

  const handleRenameStart = useCallback(() => {
    setRenameError(null)
    setRenameDraft(boardName)
    setIsRenaming(true)
  }, [boardName])

  const handleRenameCancel = useCallback(() => {
    setIsRenaming(false)
    setRenameDraft(boardName)
    setRenameError(null)
  }, [boardName])

  const handleRenameSave = useCallback(async () => {
    if (!boardId) {
      setRenameError('Missing whiteboard id')
      return
    }

    if (!isOwner) {
      setIsRenaming(false)
      return
    }

    const trimmed = renameDraft.trim()
    const currentTitle = boardName.trim() || WHITEBOARD_APP_NAME

    if (!trimmed) {
      setRenameError('Whiteboard name cannot be empty')
      return
    }

    if (trimmed === currentTitle) {
      setIsRenaming(false)
      setRenameError(null)
      return
    }

    setIsSavingRename(true)
    setRenameError(null)

    try {
      await updateWhiteboardTitle(boardId, trimmed)
      setBoardName(trimmed)
      setRenameDraft(trimmed)
      setIsRenaming(false)
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Unable to rename whiteboard')
    } finally {
      setIsSavingRename(false)
    }
  }, [boardId, boardName, isOwner, renameDraft])

  const resetTutorState = useCallback(() => {
    setAnalysis(null)
    setAnalysisError(null)
    setAnalysisLoading(false)
    setTutorOverlayVisible(true)
    setTutorLessonMessage(null)
    setTutorReadyIntent('analyze')
    setTutorDraft('')
    setTutorSubmitting(false)
    setAnnotationTool('pen')
  }, [])

  useEffect(() => {
    hasBackgroundRef.current = hasBackground
  }, [hasBackground])

  const handleRealtimeStatusChange = useCallback((status: RealtimeStatus) => {
    setRealtimeStatus(status)
  }, [])

  const handleBackgroundChange = useCallback(
    (value: boolean) => {
      if (hasBackgroundRef.current === value) {
        return
      }

      hasBackgroundRef.current = value
      setHasBackground(value)

      if (!value) {
        setBackgroundImageAsset(null)
        setConfirmRemovePhoto(false)
        resetTutorState()
      }
    },
    [resetTutorState],
  )

  const handleBackgroundImageAssetChange = useCallback((asset: BackgroundImageAsset | null) => {
    const nextSignature = asset ? `${asset.name}:${asset.mimeType}:${asset.dataUrl.length}` : null
    if (lastBackgroundAssetSignatureRef.current === nextSignature) {
      return
    }

    lastBackgroundAssetSignatureRef.current = nextSignature
    setBackgroundImageAsset(asset)
    setMobilePhotoVersion(Date.now())
    resetPhotoTransform()
  }, [resetPhotoTransform])

  const handleWhiteboardAccessDenied = useCallback(() => {
    setAccessState('denied')
    setRealtimeStatus('offline')
  }, [])

  const handlePhotoUploadClick = useCallback(() => {
    photoUploadInputRef.current?.click()
  }, [])

  const handleTextContentChange = useCallback((value: string) => {
    setTextContent(value)
    scheduleFormatProblemText(value)
  }, [scheduleFormatProblemText])

  const handleTextInputBlur = useCallback((value: string) => {
    setIsTextInputFocused(false)
    formatProblemText(value)
  }, [formatProblemText])

  const handleTextInputFocus = useCallback(() => {
    setIsTextInputFocused(true)
  }, [])

  const handleTextInputPaste = useCallback(() => {
    window.setTimeout(() => {
      const activeValue = mobileTextInputRef.current?.value ?? ''
      scheduleFormatProblemText(activeValue)
    }, 0)
  }, [scheduleFormatProblemText])

  const handlePhotoFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (mobilePhotoObjectUrl) {
      URL.revokeObjectURL(mobilePhotoObjectUrl)
    }

    const nextObjectUrl = URL.createObjectURL(file)
    setMobilePhotoObjectUrl(nextObjectUrl)
    setMobilePhotoVersion(Date.now())

    setPhotoUploadError(null)
    setInputMode('photo')
    resetTutorState()
    resetPhotoTransform()

    try {
      if (!whiteboardPadRef.current) {
        throw new Error('Whiteboard is not ready yet.')
      }
      await whiteboardPadRef.current.insertImageFile(file)
      if (window.localStorage.getItem(PHOTO_GUIDANCE_DISMISSED_KEY) !== 'true') {
        setPhotoGuidanceFading(false)
        setPhotoGuidanceVisible(true)
      }
      handleAnnotationToolSelect('pen')
    } catch (error) {
      setPhotoUploadError(error instanceof Error ? error.message : 'Unable to add photo to the whiteboard.')
    }
  }, [handleAnnotationToolSelect, mobilePhotoObjectUrl, resetPhotoTransform, resetTutorState])

  const handleRemovePhoto = useCallback(() => {
    whiteboardPadRef.current?.clearBackground()
    if (mobilePhotoObjectUrl) {
      URL.revokeObjectURL(mobilePhotoObjectUrl)
    }
    lastBackgroundAssetSignatureRef.current = null
    setMobilePhotoObjectUrl(null)
    setBackgroundImageAsset(null)
    setHasBackground(false)
    setConfirmRemovePhoto(false)
    setMobileToolbarVisible(false)
    setPhotoGuidanceVisible(false)
    setPhotoGuidanceFading(false)
    resetPhotoTransform()
    resetTutorState()
  }, [mobilePhotoObjectUrl, resetPhotoTransform, resetTutorState])

  const handleRemovePhotoRequest = useCallback(() => {
    setConfirmRemovePhoto(true)
    if (isMobileLayout) {
      scheduleMobileToolbarHide()
    }
  }, [isMobileLayout, scheduleMobileToolbarHide])

  const handleCancelRemovePhoto = useCallback(() => {
    setConfirmRemovePhoto(false)
    if (isMobileLayout) {
      scheduleMobileToolbarHide()
    }
  }, [isMobileLayout, scheduleMobileToolbarHide])

  const switchToTextMode = useCallback(() => {
    if (inputMode === 'text') return
    if (hasBackground && !window.confirm('Switch to text mode? Your photo will be cleared.')) {
      return
    }

    if (hasBackground) {
      handleRemovePhoto()
    }

    setInputMode('text')
    setMobileToolbarVisible(false)
    resetPhotoTransform()
  }, [handleRemovePhoto, hasBackground, inputMode, resetPhotoTransform])

  const switchToPhotoMode = useCallback(() => {
    if (inputMode === 'photo') return
    if (hasTextInput && !window.confirm('Switch to photo mode? Your typed problem will be cleared.')) {
      return
    }

    setTextContent('')
    setFormattedProblemLines([])
    setIsTextInputFocused(false)
    setInputMode('photo')
    resetPhotoTransform()
    resetTutorState()
  }, [hasTextInput, inputMode, resetPhotoTransform, resetTutorState])

  const handleStartAnalysis = useCallback(async (options?: { forceFresh?: boolean }) => {
    const textSource = textContent.trim() || helpRequestDraft.trim()
    const forceFresh = options?.forceFresh ?? Boolean(analysis)
    const correctedQuestionMessages = effectiveTutorInputMode === 'photo' && textContent.trim()
      ? [{
          role: 'user' as const,
          content: `Use this corrected problem statement if the photo text is unclear or inaccurate:\n\n${textContent.trim()}`,
        }]
      : []
    const initialMessages = [
      ...correctedQuestionMessages,
      ...buildInitialTutorMessages(
      tutorReadyIntent,
      helpRequestDraft,
      Boolean(hasBackground || textContent.trim()),
      ),
    ]

    if (!boardId || (!backgroundImageAsset && !textSource)) return
    setAnalysisLoading(true)
    setAnalysisError(null)
    setPhotoGuidanceVisible(false)
    setPhotoGuidanceFading(false)
    try {
      if (effectiveTutorInputMode === 'text') {
        await analyzeText(textSource, initialMessages, { forceFresh })
        return
      }

      const response = await runTutorRequest(initialMessages, 'analysis', {
        forceFresh,
      })
      applyAnalysisResponse(response)
    } catch (error) {
      setAnalysisError(getFriendlyTutorErrorMessage(error, 'The tutor could not read that photo yet. Please try again.'))
    } finally {
      setAnalysisLoading(false)
    }
  }, [analysis, analyzeText, applyAnalysisResponse, boardId, effectiveTutorInputMode, hasBackground, helpRequestDraft, runTutorRequest, textContent, tutorReadyIntent])

  const handleMobileAnalyze = useCallback(() => {
    if (!hasTutorInput || analysisLoading || responseAgeInvalid) return
    setMobileActiveTab('support')
    if (canUseTutorAssist) {
      void handleStartAnalysis()
    }
  }, [analysisLoading, canUseTutorAssist, handleStartAnalysis, hasTutorInput, responseAgeInvalid])

  const handleTutorFollowUp = useCallback(async () => {
    if (!analysis || !tutorDraft.trim()) return
    const nextMessages = buildNextMessages(analysis.messages, tutorDraft)
    setTutorSubmitting(true)
    setAnalysisError(null)
    try {
      const response = await runTutorRequest(nextMessages, 'tutor')
      setAnalysis(response)
      setTutorDraft('')
    } catch (error) {
      setAnalysisError(getFriendlyTutorErrorMessage(error, 'The tutor could not answer that follow-up yet. Please try again.'))
    } finally {
      setTutorSubmitting(false)
    }
  }, [analysis, runTutorRequest, tutorDraft])

  const handleRotatePhoto = useCallback((direction: 'left' | 'right') => {
    setPhotoTransform((current) => ({
      ...current,
      rotation: (direction === 'left'
        ? ((current.rotation + 270) % 360)
        : ((current.rotation + 90) % 360)) as PhotoTransformState['rotation'],
    }))
  }, [])

  const handleScalePhoto = useCallback((direction: 'in' | 'out') => {
    setPhotoTransform((current) => {
      const nextScale = clampNumber(direction === 'in' ? current.scale + 0.1 : current.scale - 0.1, 0.5, 3)
      const nextPan = clampPhotoPan(current.panX, current.panY, nextScale)
      return {
        ...current,
        scale: Math.round(nextScale * 10) / 10,
        ...nextPan,
      }
    })
  }, [clampPhotoPan])

  const handleFlipPhoto = useCallback((axis: 'x' | 'y') => {
    setPhotoTransform((current) => ({
      ...current,
      flipX: axis === 'x' ? !current.flipX : current.flipX,
      flipY: axis === 'y' ? !current.flipY : current.flipY,
    }))
  }, [])

  const handleFitPhotoToScreen = useCallback(() => {
    resetPhotoTransform()
  }, [resetPhotoTransform])

  const handlePhotoTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (photoTransform.scale <= 1) return
    const touch = event.touches[0]
    if (!touch) return

    touchPanStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      panX: photoTransform.panX,
      panY: photoTransform.panY,
    }
  }, [photoTransform.panX, photoTransform.panY, photoTransform.scale])

  const handlePhotoTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (photoTransform.scale <= 1 || !touchPanStartRef.current) return
    const touch = event.touches[0]
    if (!touch) return

    const deltaX = touch.clientX - touchPanStartRef.current.x
    const deltaY = touch.clientY - touchPanStartRef.current.y
    const nextPan = clampPhotoPan(
      touchPanStartRef.current.panX + deltaX,
      touchPanStartRef.current.panY + deltaY,
      photoTransform.scale,
    )

    setPhotoTransform((current) => ({
      ...current,
      ...nextPan,
    }))
  }, [clampPhotoPan, photoTransform.scale])

  const handlePhotoTouchEnd = useCallback(() => {
    touchPanStartRef.current = null
  }, [])

  useEffect(() => {
    if (!boardId) return
    let cancelled = false
    setAccessState('checking')

    ;(async () => {
      const result = await ensureWhiteboardMembership(boardId)
      if (cancelled) return
      setAccessState(result.ok ? 'allowed' : 'denied')
    })()

    return () => {
      cancelled = true
    }
  }, [boardId])

  useEffect(() => {
    if (accessState !== 'allowed') return

    let cancelled = false
    ;(async () => {
      try {
        await refreshMembers()
      } catch (error) {
        if (!cancelled) {
          console.warn('[WB-INVITE] members-load-failed', {
            boardId,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accessState, boardId, refreshMembers])

  useEffect(() => {
    if (accessState !== 'allowed' || !boardId) return

    let cancelled = false

    ;(async () => {
      try {
        const request = await getActiveWhiteboardHelpRequest(boardId)
        if (!cancelled) {
          setActiveHelpRequest(request)
          setHelpRequestError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setHelpRequestError(error instanceof Error ? error.message : 'Unable to load help request status.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accessState, boardId])

  useEffect(() => {
    if (sessionState !== 'live' || liveSessionStartedAt === null) {
      return undefined
    }

    const updateElapsed = () => {
      setLiveSessionElapsedSeconds(Math.max(0, Math.floor((Date.now() - liveSessionStartedAt) / 1000)))
    }

    updateElapsed()
    const intervalId = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(intervalId)
  }, [liveSessionStartedAt, sessionState])

  useEffect(() => {
    if (!canUseTutorAssist || !activeHelpRequest || helpRequestDraft.trim()) return

    const seededDraft = activeHelpRequest.requestText?.trim() || activeHelpRequest.problemDraft?.trim() || ''
    if (seededDraft) {
      setHelpRequestDraft(seededDraft)
    }
  }, [activeHelpRequest, canUseTutorAssist, helpRequestDraft])

  useEffect(() => {
    if (!activeHelpRequest) return

    if (activeHelpRequest.status === 'claimed') {
      const startedAt = Date.now() - ((4 * 60) + 23) * 1000
      setSessionState('live')
      setLiveSessionStartedAt(startedAt)
      setLiveSessionElapsedSeconds(4 * 60 + 23)
      setStudentPresence('online')
      return
    }

    setSessionState('queued')
    setLiveSessionStartedAt(null)
    setLiveSessionElapsedSeconds(0)
    setStudentPresence('offline')
  }, [activeHelpRequest])

  useEffect(() => {
    if (!isRenaming) return
    try {
      renameInputRef.current?.focus()
      const len = renameInputRef.current?.value.length ?? 0
      renameInputRef.current?.setSelectionRange(len, len)
    } catch {
      // ignore focus errors
    }
  }, [isRenaming])

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (shareMenuRef.current && !shareMenuRef.current.contains(target)) {
        setShareMenuOpen(false)
      }
      if (mobileOverflowRef.current && !mobileOverflowRef.current.contains(target)) {
        setMobileOverflowOpen(false)
      }
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(target)) {
        setShapeMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  useEffect(() => {
    // Fix viewport scroll: the whiteboard should stay fixed in the viewport while only the tutor panel scrolls internally.
    document.documentElement.classList.add('whiteboard-viewport-lock')
    document.body.classList.add('whiteboard-viewport-lock')

    return () => {
      document.documentElement.classList.remove('whiteboard-viewport-lock')
      document.body.classList.remove('whiteboard-viewport-lock')
    }
  }, [])

  useEffect(() => {
    document.title = WHITEBOARD_APP_NAME
  }, [])

  useEffect(() => {
    return () => {
      if (mobilePhotoObjectUrl) {
        URL.revokeObjectURL(mobilePhotoObjectUrl)
      }
    }
  }, [mobilePhotoObjectUrl])

  useEffect(() => {
    if (!hasTextInput) {
      setFormattedProblemLines([])
    }
  }, [hasTextInput])

  useEffect(() => {
    return () => {
      if (formatProblemTextTimeoutRef.current !== null) {
        window.clearTimeout(formatProblemTextTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isMobileLayout) {
      setMobileOverflowOpen(false)
      setMobileToolbarVisible(false)
      return
    }

    if (!hasBackground || mobileActiveTab !== 'homework') {
      setMobileToolbarVisible(false)
      setConfirmRemovePhoto(false)
    }
  }, [hasBackground, isMobileLayout, mobileActiveTab])

  useEffect(() => {
    if (!isMobileLayout || !mobileToolbarVisible || !hasBackground || mobileActiveTab !== 'homework') {
      if (mobileToolbarHideTimeoutRef.current) {
        window.clearTimeout(mobileToolbarHideTimeoutRef.current)
        mobileToolbarHideTimeoutRef.current = null
      }
      return undefined
    }

    scheduleMobileToolbarHide()

    return () => {
      if (mobileToolbarHideTimeoutRef.current) {
        window.clearTimeout(mobileToolbarHideTimeoutRef.current)
        mobileToolbarHideTimeoutRef.current = null
      }
    }
  }, [hasBackground, isMobileLayout, mobileActiveTab, mobileToolbarVisible, scheduleMobileToolbarHide])

  useEffect(() => {
    if (!isMobileLayout || mobileActiveTab !== 'homework' || inputMode !== 'photo') return undefined

    updateMobilePhotoContainerHeight()
    window.addEventListener('resize', updateMobilePhotoContainerHeight)

    return () => {
      window.removeEventListener('resize', updateMobilePhotoContainerHeight)
    }
  }, [inputMode, isMobileLayout, mobileActiveTab, updateMobilePhotoContainerHeight])

  useEffect(() => {
    if (!photoGuidanceVisible) return

    const timeout = window.setTimeout(() => {
      setPhotoGuidanceFading(true)
      window.setTimeout(() => {
        window.localStorage.setItem(PHOTO_GUIDANCE_DISMISSED_KEY, 'true')
        setPhotoGuidanceVisible(false)
        setPhotoGuidanceFading(false)
      }, 250)
    }, 4000)

    return () => window.clearTimeout(timeout)
  }, [photoGuidanceVisible])

  const handleDismissPhotoGuidance = useCallback(() => {
    setPhotoGuidanceFading(true)
    window.setTimeout(() => {
      window.localStorage.setItem(PHOTO_GUIDANCE_DISMISSED_KEY, 'true')
      setPhotoGuidanceVisible(false)
      setPhotoGuidanceFading(false)
    }, 250)
  }, [])

  if (!boardId) return <div>Missing board id</div>

  const pageClassName = 'h-[100dvh] w-full bg-chess-bg font-body text-chess-text'
  const mobilePhotoSceneStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    transform: `translate(${photoTransform.panX}px, ${photoTransform.panY}px) rotate(${photoTransform.rotation}deg) scale(${photoTransform.scale}) scaleX(${photoTransform.flipX ? -1 : 1}) scaleY(${photoTransform.flipY ? -1 : 1})`,
    transformOrigin: 'center center',
    transition: 'transform 180ms ease',
  }
  const renderFormattedProblemContent = (lines: FormattedProblemLine[]) => (
    <div className="min-h-full whitespace-pre-wrap break-words px-4 py-4">
      {lines.map((line) => {
        if (line.type === 'empty') {
          return <div key={line.id} className="h-[14px]" aria-hidden="true" />
        }

        if (line.type === 'question') {
          return (
            <div key={line.id} className="mt-4 first:mt-0">
              <div className="mb-3 h-px w-full bg-[#F59E0B]/45" />
              <div className="text-[17px] font-semibold leading-[1.6] text-[#F59E0B]">{line.text}</div>
            </div>
          )
        }

        if (line.type === 'data') {
          return (
            <div key={line.id} className="border-l border-[#86EFAC]/35 pl-4 font-mono text-[14px] leading-[1.7] text-[#86EFAC]">
              {line.text}
            </div>
          )
        }

        if (line.type === 'section') {
          return (
            <div key={line.id} className="mt-4 text-[13px] uppercase tracking-[0.16em] text-white/70 first:mt-0">
              {line.text}
            </div>
          )
        }

        return (
          <div key={line.id} className="text-[15px] leading-[1.7] text-[#F0EDE8]">
            {line.text}
          </div>
        )
      })}
    </div>
  )

  const renderMobileToolbar = () => (
    <div
      className={`fixed inset-x-0 top-[52px] z-40 overflow-hidden border-b border-white/10 bg-[#1c1c1e] transition-all duration-200 ${mobileToolbarVisible && hasBackground && mobileActiveTab === 'homework' ? 'max-h-11 opacity-100' : 'max-h-0 opacity-0'}`}
      aria-hidden={!mobileToolbarVisible || !hasBackground || mobileActiveTab !== 'homework'}
    >
      <div className="overflow-x-auto px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex h-11 min-w-max items-center gap-2 whitespace-nowrap">
          <ToolButton active={annotationTool === 'pen'} label="Pen" onClick={() => handleAnnotationToolSelect('pen')} icon={<PenTool className="h-4 w-4" />} compact className="shrink-0" />
          <ToolButton active={annotationTool === 'highlighter'} label="Highlighter" onClick={() => handleAnnotationToolSelect('highlighter')} icon={<Highlighter className="h-4 w-4" />} compact className="shrink-0" />
          <ToolButton active={annotationTool === 'text'} label="Text" onClick={() => handleAnnotationToolSelect('text')} icon={<Type className="h-4 w-4" />} compact className="shrink-0" />
          <ToolButton active={annotationTool === 'eraser'} label="Eraser" onClick={() => handleAnnotationToolSelect('eraser')} icon={<Eraser className="h-4 w-4" />} compact className="shrink-0" />
          <div className="relative" ref={shapeMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShapeMenuOpen((prev) => !prev)
                scheduleMobileToolbarHide()
              }}
              className={`shrink-0 rounded-[8px] px-2.5 py-2 text-[13px] font-medium transition ${['arrow', 'rectangle', 'ellipse'].includes(annotationTool) ? 'bg-amber-500 text-slate-950' : 'bg-chess-surface text-white hover:bg-amber-500/12 hover:text-chess-accentSoft'}`}
            >
              <span className="flex items-center gap-2">
                {annotationTool === 'arrow' ? <ArrowRight className="h-4 w-4" /> : annotationTool === 'rectangle' ? <Square className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                Shapes
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
            {shapeMenuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-40 rounded-[8px] border border-white/10 bg-slate-900 p-2 shadow-2xl">
                {([
                  ['arrow', <ArrowRight className="h-4 w-4" />, 'Arrow'],
                  ['rectangle', <Square className="h-4 w-4" />, 'Rectangle'],
                  ['ellipse', <Circle className="h-4 w-4" />, 'Circle'],
                ] as [ShapeTool, React.JSX.Element, string][]).map(([tool, icon, label]) => (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => handleAnnotationToolSelect(tool)}
                    className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-sm text-white transition hover:bg-amber-500/12 hover:text-chess-accentSoft"
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )

  const renderMobileHeader = () => (
    <>
      <header className="border-b border-white/12 px-3">
        <div className="flex h-[52px] items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/whiteboards')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chess-surface text-white transition-colors hover:bg-chess-surfaceSoft"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <h1 className="mx-auto max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-semibold font-display text-white">{displayBoardName}</h1>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <div className="relative" ref={mobileOverflowRef}>
              <button
                type="button"
                onClick={() => setMobileOverflowOpen((prev) => !prev)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-chess-surface text-white transition-colors hover:bg-chess-surfaceSoft"
                aria-label="More actions"
                aria-expanded={mobileOverflowOpen}
                aria-haspopup="menu"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {mobileOverflowOpen ? (
                <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-2xl" role="menu" aria-label="More actions">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOverflowOpen(false)
                      handleOpenInvite()
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                    role="menuitem"
                  >
                    <Users className="h-4 w-4" />
                    Invite
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOverflowOpen(false)
                      void handleCopyBoardLink()
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                    role="menuitem"
                  >
                    <Copy className="h-4 w-4" />
                    Copy board link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOverflowOpen(false)
                      void handleCreateJoinLink()
                    }}
                    disabled={isCreatingJoinLink}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                    role="menuitem"
                  >
                    <Share2 className="h-4 w-4" />
                    {isCreatingJoinLink ? 'Creating join link…' : 'Create join link'}
                  </button>
                </div>
              ) : null}
            </div>

            <ChessUserMenu
              onOpenPhotos={() => navigate('/photos')}
              onOpenEdit={() => navigate('/edit')}
              onOpenAdmin={() => navigate('/admin')}
              showAdminQuickAction={false}
            />
          </div>
        </div>
      </header>

      {renderMobileToolbar()}
    </>
  )

  const renderDesktopHeader = () => (
    <div className="border-b border-white/12 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:max-w-[30%]">
          <button
            onClick={() => navigate('/whiteboards')}
            className="flex items-center gap-2 rounded-lg bg-chess-surface px-3 py-2 transition-colors hover:bg-chess-surfaceSoft"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameDraft}
              disabled={isSavingRename}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleRenameSave()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  handleRenameCancel()
                }
              }}
              onBlur={() => {
                void handleRenameSave()
              }}
              className="min-w-[220px] max-w-[40vw] rounded-lg border border-white/12 bg-chess-surface px-3 py-2 text-xl font-semibold font-display text-white outline-none transition-colors focus:border-chess-accent"
              aria-label="Whiteboard name"
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-xl font-semibold font-display">{displayBoardName}</h1>
              <button
                type="button"
                onClick={handleRenameStart}
                className="rounded-md p-1.5 text-chess-muted transition-colors hover:bg-chess-surface hover:text-white"
                aria-label="Rename whiteboard"
                title="Rename whiteboard"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="order-3 flex w-full justify-center md:order-2 md:flex-1">
          {!hasBackground ? (
            <button
              onClick={handlePhotoUploadClick}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
              type="button"
            >
              <Camera className="h-4 w-4" />
              Add photo to annotate
            </button>
          ) : null}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 md:max-w-[30%]">
          <button
            type="button"
            onClick={() => setDesktopSidePanelOpen((current) => !current)}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a] ${desktopSidePanelOpen ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-chess-surface text-white hover:bg-chess-surfaceSoft'}`}
            aria-label={desktopSidePanelOpen ? 'Hide panel' : 'Open panel'}
            aria-expanded={desktopSidePanelOpen}
            aria-controls="whiteboard-side-panel"
          >
            {desktopSidePanelOpen ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            {desktopSidePanelOpen ? 'Hide panel' : 'Open panel'}
          </button>
          {canUseTutorAssist ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={handleOpenTutorQueue}
                  className="relative flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 outline-none transition hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
                  aria-label="Tutor queue"
                >
                  <span aria-hidden="true">🧑‍🏫</span>
                  Tutor queue
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    3
                  </span>
                </button>
              </div>
          ) : (
            <button
              type="button"
              onClick={handleRequestHelp}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 outline-none transition hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
              aria-label="Request help"
            >
              <span aria-hidden="true">🧠</span>
              Request help
            </button>
          )}
          <div className="relative" ref={shareMenuRef}>
            <button
              type="button"
              onClick={() => setShareMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-xl bg-chess-surface px-3 py-2 text-sm font-medium text-white outline-none transition hover:bg-chess-surfaceSoft focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
              aria-expanded={shareMenuOpen}
              aria-haspopup="menu"
            >
              <Share2 className="h-4 w-4" />
              Share ···
              <ChevronDown className="h-4 w-4" />
            </button>
            {shareMenuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-2xl" role="menu" aria-label="Share actions">
                <button
                  type="button"
                  onClick={handleOpenInvite}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                  role="menuitem"
                >
                  <Users className="h-4 w-4" />
                  Invite
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyBoardLink()}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                  role="menuitem"
                >
                  <Copy className="h-4 w-4" />
                  Copy board link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleCreateJoinLink()
                  }}
                  disabled={isCreatingJoinLink}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                  role="menuitem"
                >
                  <Share2 className="h-4 w-4" />
                  {isCreatingJoinLink ? 'Creating join link…' : 'Create join link'}
                </button>
              </div>
            ) : null}
          </div>
          <ChessUserMenu
            onOpenPhotos={() => navigate('/photos')}
            onOpenEdit={() => navigate('/edit')}
            onOpenAdmin={() => navigate('/admin')}
            showAdminQuickAction={false}
          />
        </div>
      </div>
    </div>
  )

  const renderHeader = () => (isMobileLayout ? renderMobileHeader() : renderDesktopHeader())

  if (accessState === 'checking') {
    return (
      <motion.div
        className={pageClassName}
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex h-full flex-col">
          {renderHeader()}
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-chess-muted">Checking whiteboard access…</div>
          </div>
        </div>
      </motion.div>
    )
  }

  if (accessState === 'denied') {
    return (
      <motion.div
        className={pageClassName}
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex h-full flex-col">
          {renderHeader()}
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md text-center">
              <Users className="mx-auto mb-4 h-12 w-12 text-chess-muted/50" />
              <h2 className="mb-2 text-lg font-medium">No Access</h2>
              <p className="mb-6 text-chess-muted">You don't have access to this whiteboard.</p>
              <button
                onClick={() => navigate('/whiteboards')}
                className="rounded-lg bg-chess-accent px-4 py-2 font-medium text-white transition-colors hover:bg-chess-accentSoft"
              >
                Back to Whiteboards
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={pageClassName}
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex h-full flex-col">
        {renderHeader()}

        {inviteNotice ? (
          <div className="border-b border-chess-accent/30 bg-chess-accent/10 px-4 py-3 text-sm text-chess-accentSoft">
            {inviteNotice}
          </div>
        ) : null}

        {joinLinkNotice ? (
          <div
            className={`border-b px-4 py-3 text-sm ${
              joinLinkNotice.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            {joinLinkNotice.message}
          </div>
        ) : null}

        {statusNotice ? (
          <div
            className={`border-b px-4 py-3 text-sm ${
              statusNotice.tone === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-chess-accent/30 bg-chess-accent/10 text-chess-accentSoft'
            }`}
          >
            {statusNotice.message}
          </div>
        ) : null}

        {photoUploadError ? (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {photoUploadError}
          </div>
        ) : null}

        {renameError ? (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {renameError}
          </div>
        ) : null}

        <div className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-[#374151] bg-[#1F2937] px-4 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full px-[10px] py-[3px] text-[12px] font-medium ${sessionStatusMeta.pillClassName}`}>
              {sessionStatusMeta.pillText}
            </span>
            <span className="min-w-0 text-[13px] text-[#9CA3AF]">
              {sessionSummaryText}
            </span>
          </div>

          {isTutorView && sessionState === 'queued' ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handlePickUpSession}
                className="rounded-[6px] bg-[#F59E0B] px-[14px] py-[5px] text-[13px] font-semibold text-black transition hover:bg-[#f2ab28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1F2937]"
              >
                Pick Up Session
              </button>
              <button
                type="button"
                onClick={handlePassSession}
                className="rounded-[6px] border border-[#374151] px-[14px] py-[5px] text-[13px] text-[#9CA3AF] transition hover:bg-[#111827] hover:text-[#D1D5DB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1F2937]"
              >
                Pass
              </button>
            </div>
          ) : null}

          {isTutorView && sessionState === 'live' ? (
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[12px] text-[#6B7280]">Started 4 min ago</span>
              <span className="text-[13px] text-[#9CA3AF]">🕐 {liveSessionTimerLabel}</span>
            </div>
          ) : null}

          {isTutorView && sessionState === 'async' ? (
            <div className="shrink-0 text-[12px] text-[#6B7280]">Submitted yesterday at 3:22 PM</div>
          ) : null}

          {!isTutorView ? (
            <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-[#CBD5E1]">
              {studentSessionAside}
            </div>
          ) : null}
        </div>

        <input
          ref={photoUploadInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        {isMobileLayout && confirmRemovePhoto ? (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <div className="flex flex-wrap items-center gap-2">
              <span>Remove this photo? This can't be undone.</span>
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="rounded-[8px] bg-red-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-400"
              >
                Yes, Remove
              </button>
              <button
                type="button"
                onClick={handleCancelRemovePhoto}
                className="rounded-[8px] bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {isMobileLayout ? (
          <div className="relative min-h-0 flex-1 overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>
            {hasBackground && mobileActiveTab === 'homework' ? (
              <button
                type="button"
                onClick={() => {
                  setMobileToolbarVisible((prev) => {
                    const nextVisible = !prev
                    if (nextVisible) {
                      scheduleMobileToolbarHide()
                    }
                    return nextVisible
                  })
                }}
                className={`fixed right-3 top-[60px] z-50 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${mobileToolbarVisible ? 'bg-amber-500 text-slate-950' : 'bg-[rgba(0,0,0,0.6)] text-white hover:bg-[rgba(0,0,0,0.72)]'}`}
                aria-label={mobileToolbarVisible ? 'Hide toolbar' : 'Show toolbar'}
                aria-pressed={mobileToolbarVisible}
              >
                <PenTool className="h-4.5 w-4.5" />
              </button>
            ) : null}

            <div className="absolute inset-0" style={mobileActiveTab === 'homework' ? undefined : { paddingBottom: 'calc(60px + env(safe-area-inset-bottom))' }}>
              {mobileActiveTab === 'homework' ? (
                <motion.div
                  key={inputMode}
                  ref={inputMode === 'photo' ? mobilePhotoContainerRef : undefined}
                  initial={{ opacity: 0, y: inputMode === 'text' ? 0 : -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="relative m-0 flex min-h-0 w-full items-center justify-center overflow-hidden bg-[#111111] p-0"
                  style={{
                    width: '100%',
                    height: mobilePhotoContainerHeight ? `${mobilePhotoContainerHeight}px` : 'calc(100dvh - 52px - 60px)',
                    margin: 0,
                    padding: 0,
                    marginTop: 0,
                    paddingTop: 0,
                    paddingBottom: 'env(safe-area-inset-bottom, 8px)',
                    boxSizing: 'border-box',
                  }}
                >
                  {inputMode === 'photo' ? (
                    <>
                      {hasBackground ? (
                        <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[rgba(0,0,0,0.7)] px-3 py-1.5" style={{ backdropFilter: 'blur(8px)' }}>
                          {([
                            ['Rotate left', '↺', () => handleRotatePhoto('left')],
                            ['Rotate right', '↻', () => handleRotatePhoto('right')],
                            ['Zoom in', '+', () => handleScalePhoto('in')],
                            ['Zoom out', '-', () => handleScalePhoto('out')],
                            ['Fit to screen', '⤢', handleFitPhotoToScreen],
                            ['Flip vertical', '↕', () => handleFlipPhoto('y')],
                            ['Flip horizontal', '↔', () => handleFlipPhoto('x')],
                          ] as [string, string, () => void][]).map(([label, icon, onClick]) => (
                            <button
                              key={label}
                              type="button"
                              onClick={onClick}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-white transition hover:bg-white/10"
                              aria-label={label}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="relative m-0 flex h-full w-full items-center justify-center overflow-hidden bg-[#111111] p-0" style={{ margin: 0, padding: 0, marginTop: 0, paddingTop: 0 }}>
                        {hasBackground ? (
                          <>
                            <button
                              type="button"
                              onClick={handlePhotoUploadClick}
                              className="absolute left-[12px] top-[12px] z-30 inline-flex items-center gap-1 rounded-full bg-[rgba(0,0,0,0.6)] px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-[rgba(0,0,0,0.72)]"
                              style={{ touchAction: 'manipulation' }}
                            >
                              <span aria-hidden="true">📷</span>
                              <span>Change Photo</span>
                            </button>
                            <button
                              type="button"
                              onClick={switchToTextMode}
                              className="absolute left-3 top-11 z-30 text-[12px] text-white/70 transition hover:text-white"
                              style={{ touchAction: 'manipulation' }}
                            >
                              📝 Type or paste instead
                            </button>
                          </>
                        ) : null}

                        <div
                          className={`flex h-full w-full items-center justify-center overflow-hidden ${!hasBackground ? 'pointer-events-none' : ''}`}
                          style={mobilePhotoSceneStyle}
                          onTouchStart={handlePhotoTouchStart}
                          onTouchMove={handlePhotoTouchMove}
                          onTouchEnd={handlePhotoTouchEnd}
                        >
                          <WhiteboardPad
                            ref={whiteboardPadRef}
                            boardId={boardId}
                            className="m-0 h-full w-full p-0"
                            annotationMode={hasBackground}
                            onRealtimeStatusChange={handleRealtimeStatusChange}
                            onHasBoardContentChange={setHasBoardContent}
                            onHasBackgroundChange={handleBackgroundChange}
                            onBackgroundImageAssetChange={handleBackgroundImageAssetChange}
                            onAccessDenied={handleWhiteboardAccessDenied}
                          />
                        </div>

                        {mobilePhotoObjectUrl ? <img key={mobilePhotoVersion} src={mobilePhotoObjectUrl} alt="" className="hidden" /> : null}

                        {!hasBackground ? (
                          <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
                            <div className="w-full max-w-[320px] text-center text-[#F0EDE8]">
                              <div className="text-[48px] leading-none" aria-hidden="true">📷</div>
                              <h2 className="mt-4 text-[24px] font-semibold">Add Your Homework</h2>
                              <p className="mt-3 text-[14px] leading-[1.6] text-[#c6b4a4]">Take a photo or upload from your camera roll</p>
                              <button
                                type="button"
                                onClick={handlePhotoUploadClick}
                                className="mt-5 inline-flex min-w-[128px] items-center justify-center rounded-full bg-amber-500 px-5 py-3 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                                style={{ touchAction: 'manipulation' }}
                              >
                                Add Photo
                              </button>
                              <button
                                type="button"
                                onClick={switchToTextMode}
                                className="mt-4 block w-full text-[12px] text-white/70 transition hover:text-white"
                                style={{ touchAction: 'manipulation' }}
                              >
                                📝 Type or paste instead
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {photoGuidanceVisible ? (
                          <div className="pointer-events-none absolute left-1/2 top-20 z-20 w-full max-w-[420px] -translate-x-1/2 px-4">
                            <div className={`pointer-events-auto flex items-center justify-between gap-3 rounded-[12px] border border-amber-400/35 bg-[#2b2115]/95 px-4 py-3 text-sm text-amber-100 shadow-[0_16px_36px_rgba(0,0,0,0.28)] backdrop-blur-sm transition-opacity duration-200 ${photoGuidanceFading ? 'opacity-0' : 'opacity-100'}`}>
                              <span>Make sure your work is well-lit and fully in frame 📸</span>
                              <button
                                type="button"
                                onClick={handleDismissPhotoGuidance}
                                className="shrink-0 rounded-[8px] bg-white/10 px-3 py-1.5 font-medium text-white transition hover:bg-white/15"
                              >
                                Got it
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4">
                      <div className="w-full max-w-[720px]">
                        <label htmlFor="mobile-homework-text" className="block text-[14px] font-semibold text-[#F0EDE8]">Your Problem</label>
                        <div className="relative mt-3">
                          {showFormattedProblemOverlay ? (
                            <div
                              ref={mobileFormattedOverlayRef}
                              className="pointer-events-none absolute inset-0 z-10 overflow-y-auto rounded-[12px] border border-white/15 bg-[#1e1e1e]"
                              aria-hidden="true"
                            >
                              {renderFormattedProblemContent(formattedProblemLines)}
                            </div>
                          ) : null}
                          <textarea
                            ref={mobileTextInputRef}
                            id="mobile-homework-text"
                            value={textContent}
                            onChange={(event) => handleTextContentChange(event.target.value)}
                            onFocus={handleTextInputFocus}
                            onBlur={(event) => handleTextInputBlur(event.target.value)}
                            onPaste={handleTextInputPaste}
                            onScroll={(event) => syncFormattedOverlayScroll(event.currentTarget.scrollTop)}
                            placeholder={TEXT_MODE_PLACEHOLDER}
                            className={`w-full rounded-[12px] border border-white/15 bg-[#1e1e1e] p-4 text-[16px] outline-none transition focus:border-amber-400 ${showFormattedProblemOverlay ? 'relative z-20 text-transparent caret-[#F0EDE8] selection:bg-amber-500/30' : 'text-[#F0EDE8] placeholder:text-[rgba(240,237,232,0.3)]'}`}
                            style={{ height: `${Math.max(180, Math.round((mobilePhotoContainerHeight ?? 420) * 0.4))}px`, resize: 'none' }}
                          />
                        </div>
                        <div className="mt-2 text-right text-[12px] text-white/60">{textContent.length} characters</div>
                        <button
                          type="button"
                          onClick={switchToPhotoMode}
                          className="mt-4 text-[12px] text-white/70 transition hover:text-white"
                          style={{ touchAction: 'manipulation' }}
                        >
                          📷 Use photo instead
                        </button>
                      </div>
                    </div>
                  )}

                  {hasTutorInput ? (
                    <button
                      type="button"
                      onClick={handleMobileAnalyze}
                      disabled={analysisLoading || responseAgeInvalid}
                      className="absolute right-4 z-20 inline-flex min-w-[128px] items-center justify-center gap-2 rounded-full bg-amber-500 px-5 py-3 text-[14px] font-semibold text-slate-950 shadow-[0_16px_36px_rgba(0,0,0,0.28)] transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
                      aria-label={canUseTutorAssist ? (analysisLoading ? 'Analyzing homework' : inputMode === 'text' ? 'Analyze problem' : 'Analyze photo') : 'Request help'}
                    >
                      <span aria-hidden="true">{canUseTutorAssist ? (inputMode === 'text' ? '🧠' : '📷') : '🧠'}</span>
                      {canUseTutorAssist ? (analysisLoading ? 'Analyzing…' : inputMode === 'text' ? 'Analyze Problem' : 'Analyze Photo') : 'Request Help'}
                    </button>
                  ) : null}
                </motion.div>
              ) : null}

              {mobileActiveTab === 'support' ? (
                <div className="flex h-full min-h-0 flex-col bg-[#1c1c1e]">
                  <div className="shrink-0 border-b border-white/10 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setMobileActiveTab('homework')}
                      className="inline-flex items-center gap-2 text-sm font-medium text-amber-300 transition hover:text-amber-200"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>See Homework</span>
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {canUseTutorAssist ? (
                      <AITutorTab
                        hasPhoto={hasBackground}
                        hasInput={hasTutorInput}
                        inputMode={inputMode}
                        hasBoardContent={hasBoardContent}
                        problemDraft={textContent}
                        onProblemDraftChange={handleTextContentChange}
                        helpRequestDraft={helpRequestDraft}
                        onHelpRequestDraftChange={setHelpRequestDraft}
                        analysis={analysis}
                        isLoading={analysisLoading}
                        error={analysisError}
                        onStartAnalysis={() => {
                          void handleStartAnalysis()
                        }}
                        onRetryAnalysis={() => {
                          void handleStartAnalysis({ forceFresh: true })
                        }}
                        responseAge={responseAge}
                        responseAgeInvalid={responseAgeInvalid}
                        onResponseAgeChange={handleResponseAgeChange}
                        readyIntent={tutorReadyIntent}
                        onReadyIntentChange={setTutorReadyIntent}
                        followUpDraft={tutorDraft}
                        isSubmitting={tutorSubmitting}
                        onFollowUpDraftChange={setTutorDraft}
                        onSubmitFollowUp={() => {
                          void handleTutorFollowUp()
                        }}
                      />
                    ) : (
                      <HelpRequestTab
                        hasPhoto={hasBackground}
                        hasBoardContent={hasBoardContent}
                        problemDraft={textContent}
                        helpRequestDraft={helpRequestDraft}
                        onHelpRequestDraftChange={setHelpRequestDraft}
                        activeRequest={activeHelpRequest}
                        isSubmitting={helpRequestSubmitting}
                        submitError={helpRequestError}
                        onSubmit={() => {
                          void handleSubmitHelpRequest()
                        }}
                      />
                    )}
                  </div>
                </div>
              ) : null}

              {mobileActiveTab === 'chat' ? (
                <ChatTab
                  className="h-full"
                  onRequestHumanTutor={() => {
                    return undefined
                  }}
                />
              ) : null}
            </div>

            <div className="tab-bar absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#1c1c1e]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', minHeight: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
              <div className="grid h-[60px] grid-cols-3">
                {([
                  ['homework', '📋', 'Homework'],
                  ['support', canUseTutorAssist ? '🤖' : '🧠', mobileSupportLabel],
                  ['chat', '💬', 'Chat'],
                ] as [MobileWhiteboardTab, string, string][]).map(([tabId, icon, label]) => {
                  const isActive = mobileActiveTab === tabId
                  return (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => setMobileActiveTab(tabId)}
                      className={`flex h-full flex-col items-center justify-center gap-0.5 border-t-2 text-[11px] font-medium transition-all active:scale-95 ${isActive ? 'border-[#F59E0B] text-[#F59E0B]' : 'border-transparent text-white/50 hover:text-white/80'}`}
                      aria-label={label}
                      aria-pressed={isActive}
                    >
                      <span aria-hidden="true" className="text-[24px] leading-none">{icon}</span>
                      <span>{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
              {hasBackground ? (
                <div className="border-b border-white/10 bg-[#111111] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-white/10 bg-white/[0.04] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#111111] p-1">
                        <ToolButton active={annotationTool === 'pen'} label="Pen" onClick={() => handleAnnotationToolSelect('pen')} icon={<PenTool className="h-4 w-4" />} />
                        <ToolButton active={annotationTool === 'highlighter'} label="Highlighter" onClick={() => handleAnnotationToolSelect('highlighter')} icon={<Highlighter className="h-4 w-4" />} />
                        <ToolButton active={annotationTool === 'text'} label="Text" onClick={() => handleAnnotationToolSelect('text')} icon={<Type className="h-4 w-4" />} />
                        <ToolButton active={annotationTool === 'eraser'} label="Eraser" onClick={() => handleAnnotationToolSelect('eraser')} icon={<Eraser className="h-4 w-4" />} />
                      </div>
                      <div className="relative ml-2" ref={shapeMenuRef}>
                        <button
                          type="button"
                          onClick={() => setShapeMenuOpen((prev) => !prev)}
                          className={`rounded-[8px] px-3 py-2 text-sm font-medium transition ${
                            ['arrow', 'rectangle', 'ellipse'].includes(annotationTool)
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-chess-surface text-white hover:bg-amber-500/12 hover:text-chess-accentSoft'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {annotationTool === 'arrow' ? <ArrowRight className="h-4 w-4" /> : annotationTool === 'rectangle' ? <Square className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            Shapes
                            <ChevronDown className="h-4 w-4" />
                          </span>
                        </button>
                        {shapeMenuOpen ? (
                          <div className="absolute left-1/2 top-full z-20 mt-2 w-44 -translate-x-1/2 rounded-[8px] border border-white/10 bg-slate-900 p-2 shadow-2xl">
                            {([
                              ['arrow', <ArrowRight className="h-4 w-4" />, 'Arrow'],
                              ['rectangle', <Square className="h-4 w-4" />, 'Rectangle'],
                              ['ellipse', <Circle className="h-4 w-4" />, 'Circle'],
                            ] as [ShapeTool, React.JSX.Element, string][]).map(([tool, icon, label]) => (
                              <button
                                key={tool}
                                type="button"
                                onClick={() => handleAnnotationToolSelect(tool)}
                                className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-sm text-white transition hover:bg-amber-500/12 hover:text-chess-accentSoft"
                              >
                                {icon}
                                {label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAnnotationMode((prev) => !prev)}
                        title={annotationMode ? 'Hide markers' : 'Show markers'}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          annotationMode
                            ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                            : 'border-white/10 bg-transparent text-slate-400 hover:text-white'
                        }`}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        {annotationMode ? 'Markers on' : 'Markers off'}
                      </button>
                      {/* Zoom control */}
                      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#111111] px-2 py-1">
                        <button
                          type="button"
                          onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                          className="px-1 text-sm text-slate-400 transition hover:text-white"
                        >−</button>
                        <span className="min-w-[36px] text-center text-xs text-slate-400">{zoomLevel}%</span>
                        <button
                          type="button"
                          onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
                          className="px-1 text-sm text-slate-400 transition hover:text-white"
                        >+</button>
                      </div>
                      {/* Clear annotations */}
                      <button
                        type="button"
                        onClick={() => {
                          return undefined
                        }}
                        title="Clear annotations"
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePhotoRequest}
                        className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-[#c6b4a4]/70 transition hover:bg-red-500/8 hover:text-red-200"
                      >
                        <span className="flex items-center gap-2">
                          <ImageMinus className="h-3.5 w-3.5" />
                          Remove photo
                        </span>
                      </button>
                    </div>
                  </div>

                  {confirmRemovePhoto ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[8px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                      <span>Remove this photo? This can't be undone.</span>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="rounded-[8px] bg-red-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-400"
                      >
                        Yes, Remove
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelRemovePhoto}
                        className="rounded-[8px] bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/15"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="relative min-h-0 flex-1">
                <>
                <WhiteboardPad
                  ref={whiteboardPadRef}
                  boardId={boardId}
                  className="h-full"
                  annotationMode={hasBackground}
                  onRealtimeStatusChange={handleRealtimeStatusChange}
                  onHasBoardContentChange={setHasBoardContent}
                  onHasBackgroundChange={handleBackgroundChange}
                  onBackgroundInfoChange={setBackgroundInfo}
                  onBackgroundImageAssetChange={handleBackgroundImageAssetChange}
                  onBoardFrameChange={setBoardFrame}
                  onAccessDenied={handleWhiteboardAccessDenied}
                />
                {annotationMode ? (
                  <div className="pointer-events-none absolute inset-0 z-10">
                    {annotationMarkers.map((marker) => (
                      <div
                        key={marker.id}
                        className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold shadow-lg"
                        style={{
                          left: `${marker.x}%`,
                          top: `${marker.y}%`,
                          backgroundColor: marker.color,
                          color: '#000',
                        }}
                      >
                        {marker.label}
                      </div>
                    ))}
                  </div>
                ) : null}
                {structuredAnalysisResult && effectiveTutorInputMode === 'photo' ? (
                  <TutorOverlay
                    analysisResult={structuredAnalysisResult}
                    activeStepId={tutorPlayback.activeStepId}
                    lessonMessage={tutorLessonMessage}
                    boardFrame={hasBackground && backgroundInfo ? boardFrame : null}
                    visible={tutorOverlayVisible}
                    reducedMotion={Boolean(prefersReducedMotion)}
                    onToggleVisible={() => setTutorOverlayVisible((current) => !current)}
                    onSelectStep={tutorPlayback.setActiveStepId}
                  />
                ) : null}
                  </>

                  {inputMode !== 'text' && photoGuidanceVisible ? (
                    <div className="pointer-events-none absolute left-1/2 top-5 z-20 w-full max-w-[420px] -translate-x-1/2 px-4">
                      <div className={`pointer-events-auto flex items-center justify-between gap-3 rounded-[12px] border border-amber-400/35 bg-[#2b2115]/95 px-4 py-3 text-sm text-amber-100 shadow-[0_16px_36px_rgba(0,0,0,0.28)] backdrop-blur-sm transition-opacity duration-200 ${photoGuidanceFading ? 'opacity-0' : 'opacity-100'}`}>
                        <span>Make sure your work is well-lit and fully in frame 📸</span>
                        <button
                          type="button"
                          onClick={handleDismissPhotoGuidance}
                          className="shrink-0 rounded-[8px] bg-white/10 px-3 py-1.5 font-medium text-white transition hover:bg-white/15"
                        >
                          Got it
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {panelMode === 'tutor' && activeBoardActionContext ? (
                    <div className="pointer-events-none absolute right-5 top-5 z-20 max-w-[340px]" aria-live="polite">
                      <div className="pointer-events-auto rounded-[16px] border border-amber-300/30 bg-[linear-gradient(180deg,rgba(58,40,16,0.96),rgba(17,24,39,0.98))] px-4 py-3 text-[#F9FAFB] shadow-[0_20px_44px_rgba(0,0,0,0.28)] ring-1 ring-amber-300/15 backdrop-blur-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-500/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-50">
                            <span className="inline-flex h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" />
                            Focused Step On Board
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#CBD5E1]">
                            {activeBoardActionContext.sourceText}
                          </span>
                        </div>
                        <div className="mt-3 flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/25 bg-amber-500/12 text-amber-100">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-semibold">{activeBoardActionContext.statusText}</div>
                            <div className="mt-1 text-[12px] text-[#e8d9bf]">{activeBoardActionContext.stepTitle}</div>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-[11px] text-[#9CA3AF]">Reply framing is ready in the rail.</div>
                          <button
                            type="button"
                            onClick={() => {
                              setDesktopSidePanelOpen(true)
                              setDesktopSidePanelTab('chat')
                            }}
                            className="rounded-[9px] border border-amber-300/30 bg-amber-500/12 px-2.5 py-1.5 text-[11px] font-semibold text-amber-50 transition hover:bg-amber-500/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]"
                          >
                            {activeBoardActionContext.responsePrompt}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
            </div>

            {desktopSidePanelOpen ? (
              <RightSidePanel
                className="whiteboard-side-panel"
                activeTab={desktopSidePanelTab}
                studentName={studentDisplayName}
                studentPresence={studentPresence}
                studentLastSeenText="Last seen 2 hrs ago"
                panelMode={panelMode}
                hasPhoto={hasBackground}
                hasInput={hasTutorInput}
                hasBoardContent={hasBoardContent}
                initialTab="steps"
                inputMode={effectiveTutorInputMode}
                problemDraft={textContent}
                onProblemDraftChange={handleTextContentChange}
                helpRequestDraft={helpRequestDraft}
                onHelpRequestDraftChange={setHelpRequestDraft}
                activeHelpRequest={activeHelpRequest}
                helpRequestSubmitting={helpRequestSubmitting}
                helpRequestError={helpRequestError}
                onSubmitHelpRequest={() => {
                  void handleSubmitHelpRequest()
                }}
                analysis={analysis}
                analysisResult={structuredAnalysisResult}
                analysisLoading={analysisLoading}
                analysisError={analysisError}
                onStartAnalysis={() => {
                  void handleStartAnalysis()
                }}
                onRetryAnalysis={() => {
                  void handleStartAnalysis({ forceFresh: true })
                }}
                responseAge={responseAge}
                responseAgeInvalid={responseAgeInvalid}
                onResponseAgeChange={handleResponseAgeChange}
                readyIntent={tutorReadyIntent}
                onReadyIntentChange={setTutorReadyIntent}
                tutorDraft={tutorDraft}
                tutorSubmitting={tutorSubmitting}
                onTutorDraftChange={setTutorDraft}
                onTutorSubmit={() => {
                  void handleTutorFollowUp()
                }}
                onLessonMessageChange={setTutorLessonMessage}
                activeTutorStepId={tutorPlayback.activeStepId}
                overlayVisible={tutorOverlayVisible}
                tutorPlaybackCanPlay={tutorPlayback.canPlay}
                tutorPlaybackIsPlaying={tutorPlayback.isPlaying}
                onToggleTutorOverlay={() => setTutorOverlayVisible((current) => !current)}
                onTutorPlaybackPlay={tutorPlayback.play}
                onTutorPlaybackPause={tutorPlayback.pause}
                onTutorPlaybackPrevious={tutorPlayback.previous}
                onTutorPlaybackNext={tutorPlayback.next}
                onTutorPlaybackReplay={tutorPlayback.replay}
                onTabChange={setDesktopSidePanelTab}
                onTutorStepSelect={tutorPlayback.setActiveStepId}
                onBoardActionContextChange={setActiveBoardActionContext}
                onRequestHumanTutor={() => {
                  return undefined
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      <RoomMembersModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roomTitle={displayBoardName}
        currentUserId={currentUserId}
        canInvite={isOwner}
        members={members}
        onInviteDenied={handleOpenInvite}
        onSearchUsers={handleSearchUsers}
        onInviteMember={handleInviteMember}
      />
    </motion.div>
  )
}