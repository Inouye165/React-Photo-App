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
  Layers3,
  MapPin,
  MoreVertical,
  PenTool,
  Redo2,
  Share2,
  Square,
  Trash2,
  Type,
  Undo2,
  Users,
} from 'lucide-react'
import TutorOverlay from '../components/whiteboard/TutorOverlay'
import useTutorPlayback from '../components/whiteboard/useTutorPlayback'
import type { TutorLessonMessage } from '../components/whiteboard/tabs/AITutorTab'
import type { WhiteboardBoardFrame } from '../components/whiteboard/types'
import { computeContainedRect } from '../components/whiteboard/whiteboardAspect'
import { getPreferredTutorOverlayStepId } from '../components/whiteboard/tutorOverlayGeometry'
import WhiteboardPad from '../components/whiteboard/WhiteboardPad'
import type {
  AnnotationStyle,
  AnnotationTool,
  BackgroundImageAsset,
  BackgroundInfo,
  WhiteboardCanvasHandle,
} from '../components/whiteboard/WhiteboardCanvas'
import RightSidePanel, { type BoardActionContext as RightSidePanelBoardActionContext, type ChatPreviewMessage, type TabType } from '../components/whiteboard/RightSidePanel'
import { AITutorTab, ChatTab, HelpRequestTab } from '../components/whiteboard/tabs'
import ChatWindow from '../components/chat/ChatWindow'
import {
  analyzeWhiteboardPhoto,
  createWhiteboardHelpRequest,
  createWhiteboardInvite,
  ensureWhiteboardMembership,
  getActiveWhiteboardHelpRequest,
  getWhiteboardSessionDetails,
  listTutorQueueRequests,
  updateWhiteboardTitle,
} from '../api/whiteboards'
import { ApiError } from '../api/httpClient'
import { addRoomMember, listRoomMembers, searchUsers, type UserSearchResult } from '../api/chat'
import ChessUserMenu from '../components/ChessUserMenu'
import { useAuth } from '../contexts/AuthContext'
import RoomMembersModal, { type RoomMemberSummary } from '../components/rooms/RoomMembersModal'
import type { WhiteboardHelpRequest, WhiteboardTutorMessage, WhiteboardTutorModelTier, WhiteboardTutorResponse } from '../types/whiteboard'
import { buildTutorAnalysisDeviceCacheKey, clearTutorAnalysisDeviceCache, readTutorAnalysisDeviceCache, writeTutorAnalysisDeviceCache } from '../utils/tutorAnalysisCache'
import { tutorAssistDebug } from '../utils/tutorAssistDebug'
import { formatRelativeSessionTimestampFromNow, parseSessionTimestamp } from '../utils/whiteboardSessionTimestamps'

type RealtimeStatus = 'connected' | 'connecting' | 'offline'
type SessionState = 'idle' | 'queued' | 'live' | 'async'
type ShapeTool = Extract<AnnotationTool, 'arrow' | 'rectangle' | 'ellipse'>
type MobileWhiteboardTab = 'homework' | 'support' | 'chat'
type HomeworkInputMode = 'photo' | 'text'
type TutorHelpMode = 'quick' | 'full'
type BackgroundFitMode = 'width' | 'contain'
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
const DESKTOP_ANNOTATION_COLORS = ['#111827', '#F59E0B', '#2563EB', '#DC2626'] as const
const DESKTOP_ANNOTATION_WIDTHS = [2, 4, 8, 12] as const

function getAnnotationStyleForTool(tool: AnnotationTool): Required<AnnotationStyle> {
  switch (tool) {
    case 'highlighter':
      return { strokeColor: '#F59E0B', strokeWidth: 12, opacity: 40 }
    case 'text':
      return { strokeColor: '#111827', strokeWidth: 2, opacity: 100 }
    case 'eraser':
      return { strokeColor: '#111827', strokeWidth: 2, opacity: 100 }
    case 'arrow':
    case 'rectangle':
    case 'ellipse':
      return { strokeColor: '#111827', strokeWidth: 2, opacity: 100 }
    case 'pen':
    default:
      return { strokeColor: '#111827', strokeWidth: 2, opacity: 100 }
  }
}

function buildAnnotationStyle(tool: AnnotationTool, strokeColor: string, strokeWidth: number): Required<AnnotationStyle> {
  const baseStyle = getAnnotationStyleForTool(tool)
  if (tool === 'eraser') {
    return baseStyle
  }

  return {
    strokeColor,
    strokeWidth,
    opacity: baseStyle.opacity,
  }
}

type FormattedProblemLine = {
  id: string
  type: FormattedProblemLineType
  text: string
}

type TutorLayerOption = {
  id: string
  label: string
  description: string
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
  helpMode: TutorHelpMode,
  helpRequest: string,
  includeHelpRequest: boolean,
): WhiteboardTutorMessage[] {
  const intentPrompt = helpMode === 'full'
    ? [
        'Need full help with this problem.',
        'Give the full worked solution with clear step formatting.',
        'Include an alternate method when it is genuinely useful.',
        'Include a memory trick or mnemonic only when it is genuinely useful.',
        'Include a positive coaching tip, the likely misconception, and a checkpoint question.',
      ].join(' ')
    : [
        'Need quick help with this problem.',
        'State what is wrong, state the correct answer, and give one short line the tutor can say right away.',
        'Keep it compact.',
      ].join(' ')

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

function getExistingHelpRequestFromError(error: unknown): WhiteboardHelpRequest | null {
  if (!(error instanceof ApiError) || error.status !== 409 || !error.details || typeof error.details !== 'object') {
    return null
  }

  const data = (error.details as { data?: unknown }).data
  if (!data || typeof data !== 'object') {
    return null
  }

  const request = data as Partial<WhiteboardHelpRequest>
  if (typeof request.id !== 'string' || typeof request.boardId !== 'string' || typeof request.status !== 'string') {
    return null
  }

  return request as WhiteboardHelpRequest
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
  tutorAssistDebug('assistant-data-source', {
    boardId: details.boardId ?? null,
    source: source ?? 'fresh',
    mode: details.mode,
    inputMode: details.inputMode,
  })
}

function resolveTutorOverlayFrame(
  boardFrame: WhiteboardBoardFrame | null,
  backgroundInfo: BackgroundInfo | null,
  backgroundFitMode: BackgroundFitMode,
): WhiteboardBoardFrame | null {
  if (!boardFrame) return null

  const aspectRatio = backgroundInfo?.aspectRatio
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return boardFrame
  }

  if (backgroundFitMode === 'contain') {
    const contained = computeContainedRect(boardFrame.width, boardFrame.height, aspectRatio)
    return {
      left: boardFrame.left + contained.left,
      top: boardFrame.top + contained.top,
      width: contained.width,
      height: contained.height,
    }
  }

  const width = boardFrame.width
  const height = width / aspectRatio

  return {
    left: boardFrame.left,
    top: boardFrame.top + ((boardFrame.height - height) / 2),
    width,
    height,
  }
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

function ToolbarActionButton({
  label,
  onClick,
  icon,
  compact = false,
  className = '',
}: {
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
      aria-label={label}
      title={label}
      className={`inline-flex min-h-9 box-border items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] font-medium leading-none text-white transition hover:bg-white/[0.08] hover:text-amber-100 ${compact ? 'px-2.5 py-2 text-[13px]' : 'px-3 py-2 text-sm'} ${className}`}
    >
      <span className="flex w-full items-center justify-center gap-2 text-center leading-none">
        <span className="flex shrink-0 items-center justify-center" aria-hidden="true">
          {icon}
        </span>
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
  const [boardViewModeEnabled, setBoardViewModeEnabled] = useState(false)
  const [backgroundInfo, setBackgroundInfo] = useState<BackgroundInfo | null>(null)
  const [boardFrame, setBoardFrame] = useState<WhiteboardBoardFrame | null>(null)
  const [backgroundFitMode, setBackgroundFitMode] = useState<BackgroundFitMode>('contain')
  const [backgroundImageAsset, setBackgroundImageAsset] = useState<BackgroundImageAsset | null>(null)
  const [mobilePhotoObjectUrl, setMobilePhotoObjectUrl] = useState<string | null>(null)
  const [mobilePhotoVersion, setMobilePhotoVersion] = useState(0)
  const [mobilePhotoContainerHeight, setMobilePhotoContainerHeight] = useState<number | null>(null)
  const [photoTransform, setPhotoTransform] = useState<PhotoTransformState>(DEFAULT_PHOTO_TRANSFORM)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [analysis, setAnalysis] = useState<WhiteboardTutorResponse | null>(null)
  const [activeTutorModelTier, setActiveTutorModelTier] = useState<WhiteboardTutorModelTier>('standard')
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
  const [tutorHelpMode, setTutorHelpMode] = useState<TutorHelpMode>('quick')
  const [resolvedTutorHelpMode, setResolvedTutorHelpMode] = useState<TutorHelpMode | null>(null)
  const [tutorSubmitting, setTutorSubmitting] = useState(false)
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('pen')
  const [annotationStrokeColor, setAnnotationStrokeColor] = useState('#111827')
  const [annotationStrokeWidth, setAnnotationStrokeWidth] = useState(2)
  const [tutorQueuePendingCount, setTutorQueuePendingCount] = useState<number | null>(null)
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState(false)
  const [mobileToolbarVisible, setMobileToolbarVisible] = useState(false)
  const [desktopSidePanelOpen, setDesktopSidePanelOpen] = useState(false)
  const [desktopLayersOpen, setDesktopLayersOpen] = useState(false)
  const [tutorOverlayLayerEnabled, setTutorOverlayLayerEnabled] = useState(true)
  const [visibleTutorLayerIds, setVisibleTutorLayerIds] = useState<string[]>([])
  const [boardActionNotice, setBoardActionNotice] = useState<string | null>(null)
  const [desktopSidePanelTab, setDesktopSidePanelTab] = useState<TabType>('chat')
  const [activeBoardActionContext, setActiveBoardActionContext] = useState<RightSidePanelBoardActionContext | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [liveSessionStartedAt, setLiveSessionStartedAt] = useState<number | null>(null)
  const [liveSessionElapsedSeconds, setLiveSessionElapsedSeconds] = useState(0)
  const [studentPresence, setStudentPresence] = useState<'online' | 'offline'>('offline')
  const [relativeTimeNowMs, setRelativeTimeNowMs] = useState(() => Date.now())
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileWhiteboardTab>('homework')
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false)
  const [confirmAiAssistRequest, setConfirmAiAssistRequest] = useState<{
    forceFresh: boolean
    modelTier: WhiteboardTutorModelTier
    helpMode: TutorHelpMode
  } | null>(null)
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
  const layersMenuRef = useRef<HTMLDivElement | null>(null)
  const hasBackgroundRef = useRef(false)
  const lastBackgroundAssetSignatureRef = useRef<string | null>(null)
  const helpRequestMutationVersionRef = useRef(0)
  const mobileToolbarHideTimeoutRef = useRef<number | null>(null)
  const formatProblemTextTimeoutRef = useRef<number | null>(null)
  const touchPanStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const previousAnalysisDeviceCacheKeyRef = useRef<string | null>(null)
  const activeAnalysisRequestKeyRef = useRef<string | null>(null)
  const prefersReducedMotion = useReducedMotion()

  const currentUserId = user?.id ?? null
  const canUseTutorAssist = user?.app_metadata?.role === 'admin' || user?.app_metadata?.is_tutor === true || profile?.is_tutor === true
  const canUseTutorQueue = canUseTutorAssist
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
  const participantDisplayName = useMemo(
    () => (panelMode === 'tutor' ? studentDisplayName : activeHelpRequest?.claimedByUsername?.trim() || 'Tutor'),
    [activeHelpRequest?.claimedByUsername, panelMode, studentDisplayName],
  )
  const isTutorActiveSessionFocus = isTutorView && sessionState === 'live' && desktopSidePanelOpen
  const requestSummarySource = useMemo(
    () => activeHelpRequest?.requestText?.trim() || activeHelpRequest?.problemDraft?.trim() || null,
    [activeHelpRequest?.problemDraft, activeHelpRequest?.requestText],
  )
  const requestSubmittedAgoText = useMemo(
    () => formatRelativeSessionTimestampFromNow(activeHelpRequest?.createdAt, relativeTimeNowMs),
    [activeHelpRequest?.createdAt, relativeTimeNowMs],
  )
  const sessionStartedAgoText = useMemo(
    () => formatRelativeSessionTimestampFromNow(activeHelpRequest?.claimedAt || activeHelpRequest?.updatedAt, relativeTimeNowMs),
    [activeHelpRequest?.claimedAt, activeHelpRequest?.updatedAt, relativeTimeNowMs],
  )
  const participantLastSeenText = useMemo(() => {
    if (studentPresence === 'online') {
      return 'Online now'
    }

    const referenceTime = activeHelpRequest?.claimedAt || activeHelpRequest?.updatedAt || activeHelpRequest?.createdAt || null
    const updatedAgoText = formatRelativeSessionTimestampFromNow(referenceTime, relativeTimeNowMs)
    return activeHelpRequest && updatedAgoText
      ? `Updated ${updatedAgoText}`
      : 'Waiting for updates'
  }, [activeHelpRequest, relativeTimeNowMs, studentPresence])
  const sessionChatMessages = useMemo<ChatPreviewMessage[]>(() => {
    if (!activeHelpRequest) {
      return []
    }

    const messages: ChatPreviewMessage[] = []
    const requestText = activeHelpRequest.requestText?.trim()
    if (requestText) {
      messages.push({
        id: `help-request-${activeHelpRequest.id}`,
        sender: 'student',
        body: requestText,
        timestamp: formatRelativeSessionTimestampFromNow(activeHelpRequest.createdAt, relativeTimeNowMs) ?? '',
        unread: panelMode === 'tutor' && activeHelpRequest.status === 'pending',
      })
    }

    if (activeHelpRequest.status === 'claimed') {
      messages.push({
        id: `help-claimed-${activeHelpRequest.id}`,
        sender: 'tutor',
        body: `${activeHelpRequest.claimedByUsername?.trim() || 'Tutor'} joined this board and can respond here.`,
        timestamp: formatRelativeSessionTimestampFromNow(activeHelpRequest.claimedAt || activeHelpRequest.updatedAt, relativeTimeNowMs) ?? '',
      })
    }

    return messages
  }, [activeHelpRequest, panelMode, relativeTimeNowMs])
  const hasHelpRequest = helpRequestDraft.trim().length > 0
  const hasTextInput = textContent.trim().length > 0
  const effectiveTutorInputMode: HomeworkInputMode = inputMode === 'text' || (!hasBackground && (hasTextInput || hasHelpRequest)) ? 'text' : 'photo'
  const hasTutorInput = hasBackground || hasTextInput || hasHelpRequest
  const mobileSupportLabel = canUseTutorAssist ? 'Tutor Assist' : 'Help'
  const showFormattedProblemOverlay = !isTextInputFocused && formattedProblemLines.length > 0
  const showDesktopStrokeWidthControls = annotationTool !== 'eraser' && annotationTool !== 'text'
  const tutorPlayback = useTutorPlayback({
    steps: structuredAnalysisResult?.guidedSolutionSteps ?? [],
    reducedMotion: Boolean(prefersReducedMotion),
    initialStepId: getPreferredTutorOverlayStepId(structuredAnalysisResult),
  })
  const tutorOverlayFrame = useMemo(
    () => resolveTutorOverlayFrame(hasBackground && backgroundInfo ? boardFrame : null, backgroundInfo, backgroundFitMode),
    [backgroundFitMode, backgroundInfo, boardFrame, hasBackground],
  )
  const tutorOverlayActive = Boolean(tutorLessonMessage || tutorPlayback.isWalkthroughActive || activeBoardActionContext?.source === 'assist')
  const tutorLayerOptions = useMemo<TutorLayerOption[]>(() => {
    if (!structuredAnalysisResult) {
      return []
    }

    const steps = structuredAnalysisResult.guidedSolutionSteps?.length
      ? structuredAnalysisResult.guidedSolutionSteps
      : structuredAnalysisResult.steps
    const seenRegionIds = new Set<string>()
    const nextOptions: TutorLayerOption[] = []

    for (const step of steps) {
      if (!step.regionId || seenRegionIds.has(step.regionId)) {
        continue
      }

      seenRegionIds.add(step.regionId)
      nextOptions.push({
        id: step.regionId,
        label: `Layer ${nextOptions.length + 1}`,
        description: step.shortLabel?.trim() || step.studentText?.trim() || step.kidFriendlyExplanation?.trim() || `Step ${nextOptions.length + 1}`,
      })
    }

    return nextOptions
  }, [structuredAnalysisResult])
  const visibleTutorRegionIds = useMemo(
    () => tutorLayerOptions.filter((layer) => visibleTutorLayerIds.includes(layer.id)).map((layer) => layer.id),
    [tutorLayerOptions, visibleTutorLayerIds],
  )
  const shouldRenderTutorOverlay = Boolean(
    structuredAnalysisResult && effectiveTutorInputMode === 'photo' && tutorOverlayActive && tutorOverlayLayerEnabled,
  )
  const areTutorMarkersVisible = shouldRenderTutorOverlay && tutorOverlayVisible && visibleTutorRegionIds.length > 0
  const buildTutorRequestMessages = useCallback((helpMode: TutorHelpMode) => {
    const correctedQuestionMessages = effectiveTutorInputMode === 'photo' && textContent.trim()
      ? [{
          role: 'user' as const,
          content: `Use this corrected problem statement if the photo text is unclear or inaccurate:\n\n${textContent.trim()}`,
        }]
      : []

    return [
      ...correctedQuestionMessages,
      ...buildInitialTutorMessages(helpMode, helpRequestDraft, Boolean(hasBackground || textContent.trim())),
    ]
  }, [effectiveTutorInputMode, hasBackground, helpRequestDraft, textContent])
  const buildTutorAnalysisCacheKey = useCallback((helpMode: TutorHelpMode, modelTier: WhiteboardTutorModelTier) => (
    buildTutorAnalysisDeviceCacheKey({
      boardId,
      inputMode: effectiveTutorInputMode,
      mode: 'analysis',
      helpMode,
      modelTier,
      audienceAge,
      messages: buildTutorRequestMessages(helpMode),
      textContent: effectiveTutorInputMode === 'text' ? (textContent.trim() || helpRequestDraft.trim()) : textContent.trim(),
      imageDataUrl: backgroundImageAsset?.dataUrl,
      imageMimeType: backgroundImageAsset?.mimeType,
      imageName: backgroundImageAsset?.name,
    })
  ), [audienceAge, backgroundImageAsset?.dataUrl, backgroundImageAsset?.mimeType, backgroundImageAsset?.name, boardId, buildTutorRequestMessages, effectiveTutorInputMode, helpRequestDraft, textContent])
  const analysisDeviceCacheKey = useMemo(
    () => buildTutorAnalysisCacheKey(tutorHelpMode, activeTutorModelTier),
    [activeTutorModelTier, buildTutorAnalysisCacheKey, tutorHelpMode],
  )
  const tutorAssistContextKey = analysisDeviceCacheKey

  const sessionStatusMeta = useMemo(() => {
    if (isTutorView) {
      if (sessionState === 'idle') {
        return {
          pillClassName: 'bg-white/5 text-[#CBD5E1]',
          pillText: 'No active request',
        }
      }

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

    if (sessionState === 'idle') {
      return {
        pillClassName: 'bg-white/5 text-[#CBD5E1]',
        pillText: 'Ready for help',
      }
    }

    return {
      pillClassName: 'bg-[#172554] text-[#93C5FD]',
      pillText: '💬 Help Request Sent',
    }
  }, [isTutorView, sessionState])

  const sessionSummaryText = useMemo(() => {
    if (isTutorView) {
      if (!activeHelpRequest) {
        return null
      }

      return requestSummarySource || 'Student requested help on this board.'
    }

    if (sessionState === 'live') {
      return `${participantDisplayName} is working with you on this board.`
    }

    if (sessionState === 'async') {
      return 'Your request is saved for tutor follow-up.'
    }

    if (sessionState === 'idle') {
      return 'Request help when you want a tutor to join this board.'
    }

    return 'Your help request is waiting for a tutor.'
  }, [activeHelpRequest, isTutorView, participantDisplayName, requestSummarySource, sessionState])

  const studentSessionAside = useMemo(() => {
    if (sessionState === 'live') return 'Working together now'
    if (sessionState === 'async') return 'Tutor review pending'
    if (sessionState === 'idle') return 'No tutor requested'
    return 'Waiting for tutor'
  }, [sessionState])

  const liveSessionTimerLabel = useMemo(() => {
    const minutes = Math.floor(liveSessionElapsedSeconds / 60)
    const seconds = liveSessionElapsedSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }, [liveSessionElapsedSeconds])

  const sessionMetaText = useMemo(() => {
    if (sessionState === 'live') {
      const parts = [
        sessionStartedAgoText ? `Started ${sessionStartedAgoText}` : null,
        liveSessionStartedAt !== null ? liveSessionTimerLabel : null,
      ].filter((value): value is string => Boolean(value))

      return parts.length > 0 ? parts.join(' · ') : null
    }

    if (sessionState === 'async') {
      return requestSubmittedAgoText ? `Submitted ${requestSubmittedAgoText}` : null
    }

    if (sessionState === 'queued') {
      return requestSubmittedAgoText ? `Submitted ${requestSubmittedAgoText}` : null
    }

    return null
  }, [liveSessionStartedAt, liveSessionTimerLabel, requestSubmittedAgoText, sessionStartedAgoText, sessionState])

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
      options?: { forceFresh?: boolean; modelTier?: WhiteboardTutorModelTier },
    ) => {
      if (!boardId) throw new Error('Missing board id')

      const deviceCacheKey = mode === 'analysis'
        ? buildTutorAnalysisDeviceCacheKey({
            boardId,
            inputMode: effectiveTutorInputMode,
            mode,
          modelTier: options?.modelTier ?? 'standard',
            audienceAge,
            messages,
            textContent: effectiveTutorInputMode === 'text' ? (textContent.trim() || helpRequestDraft.trim()) : textContent.trim(),
            imageDataUrl: backgroundImageAsset?.dataUrl,
            imageMimeType: backgroundImageAsset?.mimeType,
            imageName: backgroundImageAsset?.name,
          })
        : null

      tutorAssistDebug('request-analysis-start', {
        boardId,
        mode,
        inputMode: effectiveTutorInputMode,
        forceFresh: Boolean(options?.forceFresh),
        modelTier: options?.modelTier ?? 'standard',
        deviceCacheKey,
        messageCount: messages.length,
      })

      if (mode === 'analysis' && !options?.forceFresh) {
        const cachedResponse = readTutorAnalysisDeviceCache(deviceCacheKey)
        if (cachedResponse) {
          tutorAssistDebug('request-analysis-local-cache-hit', {
            boardId,
            deviceCacheKey,
            cacheSource: cachedResponse.cacheSource ?? 'local-cache',
            stepCount: cachedResponse.analysisResult?.steps?.length ?? 0,
          })
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
          modelTier: options?.modelTier ?? 'standard',
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
          modelTier: options?.modelTier ?? 'standard',
        })
      }

      if (mode === 'analysis') {
        writeTutorAnalysisDeviceCache(deviceCacheKey, response)
      }

      tutorAssistDebug('request-analysis-response-received', {
        boardId,
        mode,
        inputMode: effectiveTutorInputMode,
        cacheSource: response.cacheSource ?? 'fresh',
        stepCount: response.analysisResult?.steps?.length ?? 0,
        hasProblemText: Boolean(response.analysisResult?.problemText?.trim()),
      })

      logTutorAnalysisSource(response.cacheSource, {
        boardId,
        mode,
        inputMode: effectiveTutorInputMode,
      })

      return response
    },
    [audienceAge, backgroundImageAsset, boardId, effectiveTutorInputMode, helpRequestDraft, textContent],
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

  useEffect(() => {
    if (!canUseTutorQueue) {
      setTutorQueuePendingCount(null)
      return undefined
    }

    let cancelled = false

    const loadTutorQueueCount = async () => {
      try {
        const pendingRequests = await listTutorQueueRequests({ status: 'pending' })
        if (!cancelled) {
          setTutorQueuePendingCount(Array.isArray(pendingRequests) ? pendingRequests.length : 0)
        }
      } catch {
        if (!cancelled) {
          setTutorQueuePendingCount(null)
        }
      }
    }

    const handleRefresh = () => {
      if (document.visibilityState === 'visible') {
        void loadTutorQueueCount()
      }
    }

    void loadTutorQueueCount()
    const intervalId = window.setInterval(() => {
      void loadTutorQueueCount()
    }, 10000)

    document.addEventListener('visibilitychange', handleRefresh)
    window.addEventListener('focus', handleRefresh)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleRefresh)
      window.removeEventListener('focus', handleRefresh)
    }
  }, [canUseTutorQueue])

  const handlePickUpSession = useCallback(() => {
    const startedAt = Date.now()
    setSessionState('live')
    setLiveSessionStartedAt(startedAt)
    setLiveSessionElapsedSeconds(0)
    setStudentPresence('online')
    setDesktopSidePanelOpen(true)
  }, [])

  const handlePassSession = useCallback(() => {
    setSessionState('async')
    setLiveSessionStartedAt(null)
    setLiveSessionElapsedSeconds(0)
    setStudentPresence('offline')
  }, [])

  const handleSubmitHelpRequest = useCallback(async () => {
    if (!boardId || canUseTutorAssist) return

    setHelpRequestSubmitting(true)
    setHelpRequestError(null)
    try {
      const created = await createWhiteboardHelpRequest(boardId, {
        requestText: helpRequestDraft.trim(),
        problemDraft: textContent.trim(),
      })
      helpRequestMutationVersionRef.current += 1
      setActiveHelpRequest(created)
      setSessionState('queued')
      if (created.requestText) {
        setHelpRequestDraft(created.requestText)
      }
      setDesktopSidePanelOpen(true)
      setDesktopSidePanelTab('help-request')
      setMobileActiveTab('support')
    } catch (error) {
      const existingRequest = getExistingHelpRequestFromError(error)
      if (existingRequest) {
        helpRequestMutationVersionRef.current += 1
        setActiveHelpRequest(existingRequest)
        setHelpRequestError(null)
        setDesktopSidePanelOpen(true)
        setDesktopSidePanelTab('help-request')
        setMobileActiveTab('support')
        return
      }

      setHelpRequestError(error instanceof Error ? error.message : 'Unable to send help request.')
      setDesktopSidePanelOpen(true)
      setDesktopSidePanelTab('help-request')
      setMobileActiveTab('support')
    } finally {
      setHelpRequestSubmitting(false)
    }
  }, [boardId, canUseTutorAssist, helpRequestDraft, textContent])

  const handleRequestHelp = useCallback(() => {
    if (canUseTutorAssist) {
      setTutorHelpMode('quick')
      openDesktopSidePanel('ai-tutor')
      return
    }

    if (!activeHelpRequest && (hasTutorInput || hasBoardContent)) {
      void handleSubmitHelpRequest()
      return
    }

    openDesktopSidePanel('help-request')
  }, [activeHelpRequest, canUseTutorAssist, handleSubmitHelpRequest, hasBoardContent, hasTutorInput, openDesktopSidePanel])

  const scheduleMobileToolbarHide = useCallback(() => {
    if (mobileToolbarHideTimeoutRef.current) {
      window.clearTimeout(mobileToolbarHideTimeoutRef.current)
    }

    mobileToolbarHideTimeoutRef.current = window.setTimeout(() => {
      setMobileToolbarVisible(false)
    }, 4000)
  }, [])

  const applyAnnotationStyle = useCallback((style: AnnotationStyle) => {
    whiteboardPadRef.current?.setAnnotationStyle(style)
  }, [])

  const handleAnnotationToolSelect = useCallback((tool: AnnotationTool) => {
    const nextStyle = buildAnnotationStyle(tool, annotationStrokeColor, annotationStrokeWidth)
    setAnnotationMode(true)
    setAnnotationTool(tool)
    setAnnotationStrokeColor(nextStyle.strokeColor)
    setAnnotationStrokeWidth(nextStyle.strokeWidth)
    setShapeMenuOpen(false)
    whiteboardPadRef.current?.setAnnotationStyle(nextStyle)
    whiteboardPadRef.current?.setAnnotationTool(tool)
    if (isMobileLayout) {
      scheduleMobileToolbarHide()
    }
  }, [annotationStrokeColor, annotationStrokeWidth, isMobileLayout, scheduleMobileToolbarHide])

  const handleAnnotationColorSelect = useCallback((color: string) => {
    const nextStyle = buildAnnotationStyle(annotationTool, color, annotationStrokeWidth)
    setAnnotationStrokeColor(color)
    applyAnnotationStyle(nextStyle)
  }, [annotationStrokeWidth, annotationTool, applyAnnotationStyle])

  const handleAnnotationWidthSelect = useCallback((width: number) => {
    const nextStyle = buildAnnotationStyle(annotationTool, annotationStrokeColor, width)
    setAnnotationStrokeWidth(width)
    applyAnnotationStyle(nextStyle)
  }, [annotationStrokeColor, annotationTool, applyAnnotationStyle])

  const handleUndo = useCallback(() => {
    setBoardActionNotice(null)
    whiteboardPadRef.current?.undo()
    if (isMobileLayout) {
      scheduleMobileToolbarHide()
    }
  }, [isMobileLayout, scheduleMobileToolbarHide])

  const handleRedo = useCallback(() => {
    setBoardActionNotice(null)
    whiteboardPadRef.current?.redo()
    if (isMobileLayout) {
      scheduleMobileToolbarHide()
    }
  }, [isMobileLayout, scheduleMobileToolbarHide])

  const handleClearBoard = useCallback(() => {
    whiteboardPadRef.current?.clearCanvas()
    setBoardActionNotice('Board cleared. Use Undo to restore it.')
    setDesktopLayersOpen(false)
  }, [])

  const handleTutorLayerToggle = useCallback((layerId: string) => {
    setVisibleTutorLayerIds((current) => (
      current.includes(layerId)
        ? current.filter((id) => id !== layerId)
        : [...current, layerId]
    ))
  }, [])

  const applyAnalysisResponse = useCallback((response: WhiteboardTutorResponse, requestedModelTier: WhiteboardTutorModelTier | undefined, helpMode: TutorHelpMode) => {
    setAnalysis(response)
    setResolvedTutorHelpMode(helpMode)
    setTutorHelpMode(helpMode)
    setActiveTutorModelTier(response.modelMetadata?.tier ?? requestedModelTier ?? 'standard')
    setTutorOverlayVisible(true)
    handleAnnotationToolSelect('pen')
  }, [handleAnnotationToolSelect])

  useEffect(() => {
    const previousCacheKey = previousAnalysisDeviceCacheKeyRef.current
    if (previousCacheKey !== null && previousCacheKey !== analysisDeviceCacheKey) {
      setAnalysis(null)
      setResolvedTutorHelpMode(null)
      setAnalysisError(null)
      setTutorLessonMessage(null)
      setActiveBoardActionContext(null)
      tutorPlayback.exitWalkthrough()
    }

    previousAnalysisDeviceCacheKeyRef.current = analysisDeviceCacheKey
  }, [analysisDeviceCacheKey, tutorPlayback])

  const analyzeText = useCallback(async (rawText: string, messages: WhiteboardTutorMessage[] = [], options?: { forceFresh?: boolean; modelTier?: WhiteboardTutorModelTier; helpMode?: TutorHelpMode }) => {
    if (!boardId) throw new Error('Missing board id')

    const trimmedText = rawText.trim()
    if (!trimmedText) throw new Error('Type or paste a problem first.')

    const requestedModelTier = options?.modelTier ?? activeTutorModelTier
    const response = await runTutorRequest(messages, 'analysis', { ...options, modelTier: requestedModelTier })

    applyAnalysisResponse(response, requestedModelTier, options?.helpMode ?? tutorHelpMode)
  }, [activeTutorModelTier, applyAnalysisResponse, boardId, runTutorRequest, tutorHelpMode])

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
    setResolvedTutorHelpMode(null)
    setAnalysisError(null)
    setAnalysisLoading(false)
    setConfirmAiAssistRequest(null)
    setTutorOverlayVisible(true)
    setTutorLessonMessage(null)
    setTutorHelpMode('quick')
    setTutorDraft('')
    setTutorSubmitting(false)
    setAnnotationTool('pen')
  }, [])

  const handleClearAnalysisReview = useCallback(() => {
    if (boardId) {
      clearTutorAnalysisDeviceCache({ boardId })
    }
    resetTutorState()
    setActiveBoardActionContext(null)
    tutorPlayback.exitWalkthrough()
  }, [boardId, resetTutorState, tutorPlayback])

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
    const nextSignature = asset ? `${asset.name}:${asset.mimeType}:${asset.dataUrl}` : null
    if (lastBackgroundAssetSignatureRef.current === nextSignature) {
      return
    }

    const previousSignature = lastBackgroundAssetSignatureRef.current
    if (previousSignature && previousSignature !== nextSignature && boardId) {
      clearTutorAnalysisDeviceCache({ boardId })
      resetTutorState()
    }

    lastBackgroundAssetSignatureRef.current = nextSignature
    setBackgroundImageAsset(asset)
    setMobilePhotoVersion(Date.now())
    resetPhotoTransform()
  }, [boardId, resetPhotoTransform, resetTutorState])

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
    if (boardId) {
      clearTutorAnalysisDeviceCache({ boardId })
    }
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
  }, [boardId, handleAnnotationToolSelect, mobilePhotoObjectUrl, resetPhotoTransform, resetTutorState])

  const handleRemovePhoto = useCallback(() => {
    whiteboardPadRef.current?.clearBackground()
    setBoardActionNotice(null)
    if (mobilePhotoObjectUrl) {
      URL.revokeObjectURL(mobilePhotoObjectUrl)
    }
    lastBackgroundAssetSignatureRef.current = null
    if (boardId) {
      clearTutorAnalysisDeviceCache({ boardId })
    }
    setMobilePhotoObjectUrl(null)
    setBackgroundImageAsset(null)
    setHasBackground(false)
    setConfirmRemovePhoto(false)
    setMobileToolbarVisible(false)
    setPhotoGuidanceVisible(false)
    setPhotoGuidanceFading(false)
    resetPhotoTransform()
    resetTutorState()
  }, [boardId, mobilePhotoObjectUrl, resetPhotoTransform, resetTutorState])

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

  const performStartAnalysis = useCallback(async (options?: { forceFresh?: boolean; modelTier?: WhiteboardTutorModelTier; helpMode?: TutorHelpMode }) => {
    const textSource = textContent.trim() || helpRequestDraft.trim()
    const helpMode = options?.helpMode ?? tutorHelpMode
    const forceFresh = options?.forceFresh ?? Boolean(analysis)
    const requestedModelTier = options?.modelTier ?? 'standard'
    const requestKey = `${buildTutorAnalysisCacheKey(helpMode, requestedModelTier) ?? `analysis:${boardId ?? 'missing'}:${helpMode}:${requestedModelTier}:${effectiveTutorInputMode}`}:${forceFresh ? 'fresh' : 'cached'}`
    const initialMessages = buildTutorRequestMessages(helpMode)

    if (!boardId || (!backgroundImageAsset && !textSource)) return
    if (activeAnalysisRequestKeyRef.current === requestKey) {
      tutorAssistDebug('request-analysis-suppressed-duplicate', {
        boardId,
        requestKey,
      })
      return
    }

    activeAnalysisRequestKeyRef.current = requestKey
    setTutorHelpMode(helpMode)
    tutorAssistDebug('analysis-start', {
      boardId,
      inputMode: effectiveTutorInputMode,
      forceFresh,
      helpMode,
      modelTier: requestedModelTier,
      hasBackgroundImage: Boolean(backgroundImageAsset),
      hasTextSource: Boolean(textSource),
    })
    setAnalysis(null)
    setResolvedTutorHelpMode(null)
    setAnalysisLoading(true)
    setAnalysisError(null)
    setTutorLessonMessage(null)
    setActiveBoardActionContext(null)
    tutorPlayback.exitWalkthrough()
    setPhotoGuidanceVisible(false)
    setPhotoGuidanceFading(false)
    setActiveTutorModelTier(requestedModelTier)
    try {
      if (effectiveTutorInputMode === 'text') {
        await analyzeText(textSource, initialMessages, { forceFresh, modelTier: requestedModelTier, helpMode })
        return
      }

      const response = await runTutorRequest(initialMessages, 'analysis', {
        forceFresh,
        modelTier: requestedModelTier,
      })
      applyAnalysisResponse(response, requestedModelTier, helpMode)
      tutorAssistDebug('analysis-success', {
        boardId,
        inputMode: effectiveTutorInputMode,
        forceFresh,
        helpMode,
        cacheSource: response.cacheSource ?? 'fresh',
        stepCount: response.analysisResult?.steps?.length ?? 0,
        hasProblemText: Boolean(response.analysisResult?.problemText?.trim()),
      })
    } catch (error) {
      tutorAssistDebug('analysis-error', {
        boardId,
        inputMode: effectiveTutorInputMode,
        forceFresh,
        helpMode,
        error: error instanceof Error ? error.message : String(error),
      })
      setAnalysisError(getFriendlyTutorErrorMessage(error, 'The tutor could not read that photo yet. Please try again.'))
    } finally {
      if (activeAnalysisRequestKeyRef.current === requestKey) {
        activeAnalysisRequestKeyRef.current = null
      }
      setAnalysisLoading(false)
    }
  }, [analysis, analyzeText, applyAnalysisResponse, backgroundImageAsset, boardId, buildTutorAnalysisCacheKey, buildTutorRequestMessages, effectiveTutorInputMode, helpRequestDraft, runTutorRequest, textContent, tutorHelpMode, tutorPlayback])

  const requestAiAssistConfirmation = useCallback((helpMode: TutorHelpMode, options?: { forceFresh?: boolean; modelTier?: WhiteboardTutorModelTier }) => {
    if (!hasTutorInput || analysisLoading || responseAgeInvalid) {
      tutorAssistDebug('analysis-confirmation-blocked', {
        hasTutorInput,
        analysisLoading,
        responseAgeInvalid,
      })
      return
    }

    setTutorHelpMode(helpMode)

    const requestedModelTier = options?.modelTier ?? 'standard'
    if (!options?.forceFresh) {
      const cachedResponse = readTutorAnalysisDeviceCache(buildTutorAnalysisCacheKey(helpMode, requestedModelTier))
      if (cachedResponse) {
        applyAnalysisResponse(cachedResponse, requestedModelTier, helpMode)
        return
      }
    }

    tutorAssistDebug('analysis-confirmation-open', {
      boardId,
      forceFresh: Boolean(options?.forceFresh ?? analysis),
      helpMode,
      modelTier: requestedModelTier,
      inputMode: effectiveTutorInputMode,
    })
    setConfirmAiAssistRequest({
      forceFresh: Boolean(options?.forceFresh ?? analysis),
      modelTier: requestedModelTier,
      helpMode,
    })
  }, [analysis, analysisLoading, applyAnalysisResponse, boardId, buildTutorAnalysisCacheKey, effectiveTutorInputMode, hasTutorInput, responseAgeInvalid])

  const handleConfirmAiAssistRequest = useCallback(() => {
    if (!confirmAiAssistRequest) return

    const nextOptions = {
      forceFresh: confirmAiAssistRequest.forceFresh,
      modelTier: confirmAiAssistRequest.modelTier,
      helpMode: confirmAiAssistRequest.helpMode,
    }
    tutorAssistDebug('analysis-confirmation-accepted', {
      boardId,
      forceFresh: nextOptions.forceFresh,
      helpMode: nextOptions.helpMode,
      modelTier: nextOptions.modelTier,
    })
    setConfirmAiAssistRequest(null)
    void performStartAnalysis(nextOptions)
  }, [boardId, confirmAiAssistRequest, performStartAnalysis])

  const handleCancelAiAssistRequest = useCallback(() => {
    tutorAssistDebug('analysis-confirmation-cancelled', { boardId })
    setConfirmAiAssistRequest(null)
  }, [boardId])

  const handleMobileAnalyze = useCallback(() => {
    if (canUseTutorAssist) {
      if (!hasTutorInput || analysisLoading || responseAgeInvalid) return
      setMobileActiveTab('support')
      return
    }

    if (!activeHelpRequest && (hasTutorInput || hasBoardContent)) {
      void handleSubmitHelpRequest()
      return
    }

    setMobileActiveTab('support')
  }, [activeHelpRequest, analysisLoading, canUseTutorAssist, handleSubmitHelpRequest, hasBoardContent, hasTutorInput, responseAgeInvalid])

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
    let intervalId: number | null = null

    const loadActiveHelpRequest = async () => {
      const requestVersion = helpRequestMutationVersionRef.current

      try {
        const request = await getActiveWhiteboardHelpRequest(boardId)
        if (!cancelled && requestVersion === helpRequestMutationVersionRef.current) {
          setActiveHelpRequest(request)
          setHelpRequestError(null)
        }
      } catch (error) {
        if (!cancelled && requestVersion === helpRequestMutationVersionRef.current) {
          setHelpRequestError(error instanceof Error ? error.message : 'Unable to load help request status.')
        }
      }
    }

    ;(async () => {
      await loadActiveHelpRequest()
    })()

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') {
        void loadActiveHelpRequest()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityRefresh)
    window.addEventListener('focus', handleVisibilityRefresh)
    intervalId = window.setInterval(() => {
      void loadActiveHelpRequest()
    }, 10000)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityRefresh)
      window.removeEventListener('focus', handleVisibilityRefresh)
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
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
    setRelativeTimeNowMs(Date.now())

    if (!activeHelpRequest) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setRelativeTimeNowMs(Date.now())
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [activeHelpRequest?.claimedAt, activeHelpRequest?.createdAt, activeHelpRequest?.id, activeHelpRequest?.updatedAt])

  useEffect(() => {
    if (!activeHelpRequest) {
      setSessionState('idle')
      setLiveSessionStartedAt(null)
      setLiveSessionElapsedSeconds(0)
      setStudentPresence('offline')
      return
    }

    if (activeHelpRequest.status === 'claimed') {
      const startedAt = parseSessionTimestamp(activeHelpRequest.claimedAt || activeHelpRequest.updatedAt)
      setSessionState('live')
      setLiveSessionStartedAt(startedAt)
      setLiveSessionElapsedSeconds(startedAt === null ? 0 : Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
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
      if (layersMenuRef.current && !layersMenuRef.current.contains(target)) {
        setDesktopLayersOpen(false)
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
    if (!tutorLayerOptions.length) {
      setVisibleTutorLayerIds([])
      return
    }

    setVisibleTutorLayerIds((current) => {
      const filtered = current.filter((layerId) => tutorLayerOptions.some((layer) => layer.id === layerId))
      return filtered.length > 0 ? filtered : tutorLayerOptions.map((layer) => layer.id)
    })
  }, [tutorLayerOptions])

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
          <ToolbarActionButton label="Undo" onClick={handleUndo} icon={<Undo2 className="h-4 w-4" />} compact className="shrink-0" />
          <ToolbarActionButton label="Redo" onClick={handleRedo} icon={<Redo2 className="h-4 w-4" />} compact className="shrink-0" />
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

  const renderDesktopHeader = () => {
    if (isTutorActiveSessionFocus) {
      return (
        <div className="border-b border-white/12 bg-[#0f172a] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => navigate('/whiteboards')}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-[10px] py-[3px] text-[11px] font-medium ${sessionStatusMeta.pillClassName}`}>
                    {sessionStatusMeta.pillText}
                  </span>
                  <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                    Tutor Focus
                  </span>
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#CBD5E1]">
                  <span className="truncate font-semibold text-white">{participantDisplayName}</span>
                  {sessionSummaryText ? <span className="truncate text-[#9CA3AF]">{sessionSummaryText}</span> : null}
                  {sessionStartedAgoText ? <span className="text-[#6B7280]">Started {sessionStartedAgoText}</span> : null}
                  {liveSessionStartedAt !== null ? <span className="text-[#9CA3AF]">{liveSessionTimerLabel}</span> : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setDesktopSidePanelOpen(false)}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
                aria-label="Hide panel"
                aria-expanded={desktopSidePanelOpen}
                aria-controls="whiteboard-side-panel"
              >
                <ArrowRight className="h-4 w-4" />
                Hide panel
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
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
                    {typeof tutorQueuePendingCount === 'number' && tutorQueuePendingCount > 0 ? (
                      <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
                        {tutorQueuePendingCount}
                      </span>
                    ) : null}
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
  }

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

        {boardActionNotice ? (
          <div className="border-b border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {boardActionNotice}
          </div>
        ) : null}

        <div className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-[#374151] bg-[#1F2937] px-4 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full px-[10px] py-[3px] text-[12px] font-medium ${sessionStatusMeta.pillClassName}`}>
              {sessionStatusMeta.pillText}
            </span>
            {sessionSummaryText ? (
              <span className="min-w-0 text-[13px] text-[#9CA3AF]">
                {sessionSummaryText}
              </span>
            ) : null}
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
              {sessionStartedAgoText ? <span className="text-[12px] text-[#6B7280]">Started {sessionStartedAgoText}</span> : null}
              {liveSessionStartedAt !== null ? <span className="text-[13px] text-[#9CA3AF]">🕐 {liveSessionTimerLabel}</span> : null}
            </div>
          ) : null}

          {isTutorView && sessionState === 'async' ? (
            sessionMetaText ? <div className="shrink-0 text-[12px] text-[#6B7280]">{sessionMetaText}</div> : null
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
                            annotationMode={annotationMode}
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
                        analysisMode={resolvedTutorHelpMode}
                        isLoading={analysisLoading}
                        error={analysisError}
                        assistContextKey={tutorAssistContextKey}
                        onStartAnalysis={(helpMode) => {
                          requestAiAssistConfirmation(helpMode)
                        }}
                        onRetryAnalysis={(helpMode) => {
                          requestAiAssistConfirmation(helpMode, { forceFresh: true })
                        }}
                        onUseStrongerModel={(helpMode) => {
                          requestAiAssistConfirmation(helpMode, { forceFresh: true, modelTier: 'stronger' })
                        }}
                        walkthroughActive={tutorPlayback.isWalkthroughActive}
                        activeWalkthroughStepId={tutorPlayback.activeStepId}
                        canWalkthroughPlay={tutorPlayback.canPlay}
                        isWalkthroughPlaying={tutorPlayback.isPlaying}
                        onEnterWalkthrough={tutorPlayback.enterWalkthrough}
                        onExitWalkthrough={tutorPlayback.exitWalkthrough}
                        onWalkthroughSelectStep={tutorPlayback.setActiveStepId}
                        onWalkthroughPrevious={tutorPlayback.previous}
                        onWalkthroughNext={tutorPlayback.next}
                        onWalkthroughPlay={tutorPlayback.play}
                        onWalkthroughPause={tutorPlayback.pause}
                        onWalkthroughReplay={tutorPlayback.replay}
                        responseAge={responseAge}
                        responseAgeInvalid={responseAgeInvalid}
                        onResponseAgeChange={handleResponseAgeChange}
                        followUpDraft={tutorDraft}
                        isSubmitting={tutorSubmitting}
                        onFollowUpDraftChange={setTutorDraft}
                        onSubmitFollowUp={() => {
                          void handleTutorFollowUp()
                        }}
                        onLessonMessageChange={setTutorLessonMessage}
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
                panelMode === 'tutor' ? (
                  <div className="h-full min-h-0 overflow-hidden bg-white">
                    <ChatWindow roomId={boardId} mode="conversation" />
                  </div>
                ) : (
                  <ChatTab
                    className="h-full"
                    onRequestHumanTutor={() => {
                      return undefined
                    }}
                  />
                )
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
          <div className={`flex min-h-0 flex-1 overflow-hidden ${isTutorActiveSessionFocus ? 'bg-[#0b1220]' : ''}`}>
            <div
              className={`relative flex min-w-0 flex-1 flex-col overflow-hidden ${isTutorActiveSessionFocus ? 'border-r border-white/10 bg-[#0f172a]' : ''}`}
              style={isTutorActiveSessionFocus ? { flex: '1 1 62%' } : undefined}
            >
              {isTutorActiveSessionFocus ? (
                <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,14,26,0.96))] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100">Board reference</div>
                      <div className="mt-1 text-[13px] text-[#9CA3AF]">Use the board for context only. Diagnosis and reply framing stay in the rail.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDesktopSidePanelTab('chat')}
                      className="rounded-[10px] border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-50 transition hover:bg-amber-500/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
                    >
                      Jump to response
                    </button>
                  </div>
                </div>
              ) : null}
              <div className={`flex min-h-0 flex-1 ${hasBackground ? 'gap-3 px-3 py-3' : ''}`}>
                {hasBackground ? (
                  <aside className="z-20 flex w-[104px] shrink-0 flex-col gap-2">
                    <div className="flex flex-col gap-2 rounded-[14px] border border-white/8 bg-[rgba(9,14,24,0.84)] p-2 shadow-[0_14px_28px_rgba(0,0,0,0.22)] backdrop-blur-sm">
                      <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/8 bg-[rgba(17,17,17,0.82)] p-1">
                        <ToolbarActionButton label="Undo" onClick={handleUndo} icon={<Undo2 className="h-4 w-4" />} compact className="justify-center px-2" />
                        <ToolbarActionButton label="Redo" onClick={handleRedo} icon={<Redo2 className="h-4 w-4" />} compact className="justify-center px-2" />
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg border border-white/8 bg-[rgba(17,17,17,0.82)] p-1">
                        <ToolButton active={annotationTool === 'pen'} label="Pen" onClick={() => handleAnnotationToolSelect('pen')} icon={<PenTool className="h-4 w-4" />} compact />
                        <ToolButton active={annotationTool === 'highlighter'} label="Highlighter" onClick={() => handleAnnotationToolSelect('highlighter')} icon={<Highlighter className="h-4 w-4" />} compact />
                        <ToolButton active={annotationTool === 'text'} label="Text" onClick={() => handleAnnotationToolSelect('text')} icon={<Type className="h-4 w-4" />} compact />
                        <ToolButton active={annotationTool === 'eraser'} label="Eraser" onClick={() => handleAnnotationToolSelect('eraser')} icon={<Eraser className="h-4 w-4" />} compact />
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg border border-white/8 bg-[rgba(17,17,17,0.82)] p-1">
                        <ToolbarActionButton
                          label="Background"
                          onClick={() => whiteboardPadRef.current?.openBackgroundPicker()}
                          icon={<Camera className="h-4 w-4" />}
                          compact
                        />
                        <ToolbarActionButton
                          label={backgroundFitMode === 'width' ? 'Show full' : 'Fit width'}
                          onClick={() => whiteboardPadRef.current?.toggleBackgroundFitMode()}
                          icon={<Copy className="h-4 w-4" />}
                          compact
                        />
                        <ToolbarActionButton
                          label={boardViewModeEnabled ? 'Draw mode' : 'View mode'}
                          onClick={() => whiteboardPadRef.current?.toggleViewMode()}
                          icon={<Edit3 className="h-4 w-4" />}
                          compact
                        />
                      </div>
                      {annotationTool !== 'eraser' ? (
                        <div className="rounded-lg border border-white/8 bg-[rgba(17,17,17,0.82)] px-2 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Stroke</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {DESKTOP_ANNOTATION_COLORS.map((color) => {
                              const isActive = annotationStrokeColor === color
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  aria-label={`Use ${color} stroke`}
                                  aria-pressed={isActive}
                                  onClick={() => handleAnnotationColorSelect(color)}
                                  className={`h-6 w-6 rounded-full border-2 transition ${isActive ? 'border-white scale-105' : 'border-white/20 hover:border-white/50'}`}
                                  style={{ backgroundColor: color }}
                                />
                              )
                            })}
                          </div>
                          {showDesktopStrokeWidthControls ? (
                            <div className="mt-2 grid grid-cols-4 gap-1.5">
                              {DESKTOP_ANNOTATION_WIDTHS.map((width) => {
                                const isActive = annotationStrokeWidth === width
                                return (
                                  <button
                                    key={width}
                                    type="button"
                                    aria-label={`Use ${width}px stroke`}
                                    aria-pressed={isActive}
                                    onClick={() => handleAnnotationWidthSelect(width)}
                                    className={`rounded-[8px] px-0 py-1.5 text-[11px] font-semibold transition ${isActive ? 'bg-amber-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'}`}
                                  >
                                    {width}
                                  </button>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="relative" ref={shapeMenuRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setDesktopLayersOpen(false)
                            setShapeMenuOpen((prev) => !prev)
                          }}
                          className={`w-full rounded-[8px] px-3 py-2 text-sm font-medium transition ${
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
                          <div className="absolute left-full top-0 z-20 ml-2 w-44 rounded-[8px] border border-white/10 bg-slate-900 p-2 shadow-2xl">
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
                      <div className="relative" ref={layersMenuRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setShapeMenuOpen(false)
                            setDesktopLayersOpen((prev) => !prev)
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                            desktopLayersOpen
                              ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                              : 'border-white/10 bg-transparent text-slate-300 hover:border-white/20 hover:text-white'
                          }`}
                          aria-expanded={desktopLayersOpen}
                          aria-haspopup="menu"
                        >
                          <Layers3 className="h-3.5 w-3.5" />
                          Layers
                        </button>
                        {desktopLayersOpen ? (
                          <div className="absolute left-full top-0 z-20 ml-2 w-72 rounded-[12px] border border-white/10 bg-slate-900 p-3 shadow-2xl" role="menu" aria-label="Layer visibility">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Visible Layers</div>
                            <div className="mt-3 space-y-2">
                              <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-white/6 bg-white/[0.03] px-3 py-2 text-left">
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-400"
                                  checked={tutorOverlayLayerEnabled}
                                  disabled={!structuredAnalysisResult}
                                  onChange={(event) => setTutorOverlayLayerEnabled(event.target.checked)}
                                  aria-label="Tutor overlay"
                                />
                                <span>
                                  <span className="block text-sm font-semibold text-white">Tutor overlay</span>
                                  <span className="block text-xs text-slate-400">Show guided highlights on top of the board.</span>
                                </span>
                              </label>
                              <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-white/6 bg-white/[0.03] px-3 py-2 text-left">
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-400"
                                  checked={tutorOverlayVisible}
                                  disabled={!structuredAnalysisResult || !tutorOverlayLayerEnabled}
                                  onChange={(event) => setTutorOverlayVisible(event.target.checked)}
                                  aria-label="Markers"
                                />
                                <span>
                                  <span className="block text-sm font-semibold text-white">Markers</span>
                                  <span className="block text-xs text-slate-400">Show step markers only when the overlay is enabled.</span>
                                </span>
                              </label>
                              {tutorLayerOptions.length > 0 ? (
                                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                  {tutorLayerOptions.map((layer) => (
                                    <label key={layer.id} className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-white/6 bg-white/[0.03] px-3 py-2 text-left">
                                      <input
                                        type="checkbox"
                                        className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-400"
                                        checked={visibleTutorLayerIds.includes(layer.id)}
                                        disabled={!tutorOverlayLayerEnabled || !tutorOverlayVisible}
                                        onChange={() => handleTutorLayerToggle(layer.id)}
                                        aria-label={layer.label}
                                      />
                                      <span>
                                        <span className="block text-sm font-semibold text-white">{layer.label}</span>
                                        <span className="block text-xs text-slate-400">{layer.description}</span>
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-[10px] border border-dashed border-white/10 px-3 py-3 text-xs text-slate-400">
                                  Tutor layers appear here after an analysis is available.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={handleClearBoard}
                        title="Clear board"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"
                      >
                        <span className="flex items-center gap-2 text-[12px] font-medium">
                          <Trash2 className="h-4 w-4" />
                          Clear board
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePhotoRequest}
                        className="rounded-[8px] px-2 py-2 text-left text-[12px] font-medium text-[#c6b4a4]/70 transition hover:bg-red-500/8 hover:text-red-200"
                      >
                        <span className="flex items-center gap-2">
                          <ImageMinus className="h-3.5 w-3.5" />
                          Remove photo
                        </span>
                      </button>
                      {backgroundInfo ? (
                        <div className="rounded-[10px] border border-white/8 bg-[rgba(17,17,17,0.82)] px-3 py-2 text-[11px] text-slate-300">
                          <div className="font-semibold text-white">Background</div>
                          <div className="mt-1 truncate" title={backgroundInfo.name}>{backgroundInfo.name}</div>
                          <div className="mt-1 text-slate-400">{backgroundInfo.convertedType ?? backgroundInfo.originalType ?? 'image/*'}</div>
                        </div>
                      ) : null}
                    </div>

                    {confirmRemovePhoto ? (
                      <div className="flex flex-col gap-2 rounded-[10px] border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-100">
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
                  </aside>
                ) : null}

                <div className="relative min-h-0 min-w-0 flex-1">
                  <WhiteboardPad
                    ref={whiteboardPadRef}
                    boardId={boardId}
                    className="h-full"
                    annotationMode={annotationMode}
                    onRealtimeStatusChange={handleRealtimeStatusChange}
                    onViewModeChange={setBoardViewModeEnabled}
                    onHasBoardContentChange={setHasBoardContent}
                    onHasBackgroundChange={handleBackgroundChange}
                    onBackgroundFitModeChange={setBackgroundFitMode}
                    onBackgroundInfoChange={setBackgroundInfo}
                    onBackgroundImageAssetChange={handleBackgroundImageAssetChange}
                    onBoardFrameChange={setBoardFrame}
                    onAccessDenied={handleWhiteboardAccessDenied}
                    minimalChrome
                  />
                  {shouldRenderTutorOverlay ? (
                    <TutorOverlay
                      analysisResult={structuredAnalysisResult}
                      activeStepId={tutorPlayback.activeStepId}
                      analysisSource={analysis?.analysisSource ?? null}
                      lessonMessage={tutorLessonMessage}
                      boardFrame={tutorOverlayFrame}
                      visible={areTutorMarkersVisible}
                      reducedMotion={Boolean(prefersReducedMotion)}
                      onToggleVisible={() => setTutorOverlayVisible((current) => !current)}
                      onSelectStep={tutorPlayback.setActiveStepId}
                      allowedRegionIds={visibleTutorRegionIds}
                      showVisibilityToggle={false}
                    />
                  ) : null}

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
            </div>

            {desktopSidePanelOpen ? (
              <RightSidePanel
                className="whiteboard-side-panel"
                width={isTutorActiveSessionFocus ? 'clamp(380px, 34vw, 520px)' : 'clamp(320px, 28vw, 440px)'}
                activeTab={desktopSidePanelTab}
                chatRoomId={panelMode === 'tutor' ? boardId : null}
                studentName={participantDisplayName}
                studentPresence={studentPresence}
                studentLastSeenText={participantLastSeenText}
                initialChatMessages={sessionChatMessages}
                panelMode={panelMode}
                hasPhoto={hasBackground}
                hasInput={hasTutorInput}
                hasBoardContent={hasBoardContent}
                initialTab="chat"
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
                analysisMode={resolvedTutorHelpMode}
                analysisResult={structuredAnalysisResult}
                analysisLoading={analysisLoading}
                analysisError={analysisError}
                sessionState={sessionState === 'idle' ? undefined : sessionState}
                sessionBadgeText={sessionStatusMeta.pillText}
                sessionSummaryText={sessionSummaryText ?? undefined}
                sessionMetaText={sessionMetaText}
                onPickUpSession={handlePickUpSession}
                onPassSession={handlePassSession}
                analysisPendingConfirmation={Boolean(confirmAiAssistRequest)}
                onStartAnalysis={(helpMode) => {
                  requestAiAssistConfirmation(helpMode)
                }}
                onRetryAnalysis={(helpMode) => {
                  requestAiAssistConfirmation(helpMode, { forceFresh: true })
                }}
                onUseStrongerModel={(helpMode) => {
                  requestAiAssistConfirmation(helpMode, { forceFresh: true, modelTier: 'stronger' })
                }}
                responseAge={responseAge}
                responseAgeInvalid={responseAgeInvalid}
                onResponseAgeChange={handleResponseAgeChange}
                tutorDraft={tutorDraft}
                tutorSubmitting={tutorSubmitting}
                onTutorDraftChange={setTutorDraft}
                onTutorSubmit={() => {
                  void handleTutorFollowUp()
                }}
                onLessonMessageChange={setTutorLessonMessage}
                assistContextKey={tutorAssistContextKey}
                activeTutorStepId={tutorPlayback.activeStepId}
                tutorWalkthroughActive={tutorPlayback.isWalkthroughActive}
                overlayVisible={areTutorMarkersVisible}
                tutorPlaybackCanPlay={tutorPlayback.canPlay}
                tutorPlaybackIsPlaying={tutorPlayback.isPlaying}
                onTutorWalkthroughEnter={tutorPlayback.enterWalkthrough}
                onTutorWalkthroughExit={tutorPlayback.exitWalkthrough}
                onToggleTutorOverlay={() => setTutorOverlayVisible((current) => !current)}
                onTutorPlaybackPlay={tutorPlayback.play}
                onTutorPlaybackPause={tutorPlayback.pause}
                onTutorPlaybackPrevious={tutorPlayback.previous}
                onTutorPlaybackNext={tutorPlayback.next}
                onTutorPlaybackReplay={tutorPlayback.replay}
                onTabChange={setDesktopSidePanelTab}
                onTutorStepSelect={tutorPlayback.setActiveStepId}
                onBoardActionContextChange={setActiveBoardActionContext}
                onClearAnalysisReview={handleClearAnalysisReview}
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

      {confirmAiAssistRequest ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="confirm-ai-assist-title">
          <div className="w-full max-w-md rounded-[20px] border border-amber-400/25 bg-[#111827] p-5 text-[#F9FAFB] shadow-[0_28px_64px_rgba(0,0,0,0.38)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-500/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100">
              <span aria-hidden="true">$</span>
              Paid AI request
            </div>
            <h2 id="confirm-ai-assist-title" className="mt-4 text-[20px] font-semibold">
              Confirm request AI assistance
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-[#D1D5DB]">
              {confirmAiAssistRequest.modelTier === 'stronger'
                ? 'This will send a paid AI request using the stronger tutor model for this homework image or problem.'
                : confirmAiAssistRequest.forceFresh
                  ? 'This will send another paid AI request for this homework image or problem.'
                  : 'This will send a paid AI request for this homework image or problem.'}
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[#9CA3AF]">
              If the tutor can handle it without AI, cancel now and no AI call will be made.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCancelAiAssistRequest}
                className="rounded-[10px] border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[14px] font-medium text-[#D1D5DB] transition hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAiAssistRequest}
                className="rounded-[10px] bg-amber-500 px-4 py-2.5 text-[14px] font-semibold text-slate-950 transition hover:bg-amber-400"
              >
                Confirm AI assistance
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </motion.div>
  )
}