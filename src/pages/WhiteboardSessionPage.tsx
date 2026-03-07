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
  PenTool,
  Share2,
  Square,
  Type,
  Users,
} from 'lucide-react'
import WhiteboardPad from '../components/whiteboard/WhiteboardPad'
import type {
  AnnotationTool,
  BackgroundImageAsset,
  WhiteboardCanvasHandle,
} from '../components/whiteboard/WhiteboardCanvas'
import RightSidePanel, { type TabType } from '../components/whiteboard/RightSidePanel'
import {
  analyzeWhiteboardPhoto,
  createWhiteboardInvite,
  ensureWhiteboardMembership,
  getWhiteboardSessionDetails,
  updateWhiteboardTitle,
} from '../api/whiteboards'
import { addRoomMember, listRoomMembers, searchUsers, type UserSearchResult } from '../api/chat'
import ChessUserMenu from '../components/ChessUserMenu'
import { useAuth } from '../contexts/AuthContext'
import RoomMembersModal, { type RoomMemberSummary } from '../components/rooms/RoomMembersModal'
import type { WhiteboardTutorMessage, WhiteboardTutorResponse } from '../types/whiteboard'

type RealtimeStatus = 'connected' | 'connecting' | 'offline'
type ShapeTool = Extract<AnnotationTool, 'arrow' | 'rectangle' | 'ellipse'>
const WHITEBOARD_APP_NAME = 'HomeworkHelper'
const PHOTO_GUIDANCE_DISMISSED_KEY = 'photoGuidanceDismissed'

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

function parseAudienceAge(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 20) {
    return undefined
  }

  return parsed
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

function ToolButton({
  active,
  label,
  onClick,
  icon,
}: {
  active: boolean
  label: string
  onClick: () => void
  icon: React.JSX.Element
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[8px] px-3 py-2 text-sm font-medium transition ${
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

export default function WhiteboardSessionPage(): React.JSX.Element {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
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
  const [hasBackground, setHasBackground] = useState(false)
  const [backgroundImageAsset, setBackgroundImageAsset] = useState<BackgroundImageAsset | null>(null)
  const [analysis, setAnalysis] = useState<WhiteboardTutorResponse | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [responseAge, setResponseAge] = useState('')
  const [tutorDraft, setTutorDraft] = useState('')
  const [tutorSubmitting, setTutorSubmitting] = useState(false)
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('pen')
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false)
  const [photoGuidanceVisible, setPhotoGuidanceVisible] = useState(false)
  const [photoGuidanceFading, setPhotoGuidanceFading] = useState(false)
  const inviteDeniedLoggedRef = useRef(false)
  const whiteboardPadRef = useRef<WhiteboardCanvasHandle>(null)
  const photoUploadInputRef = useRef<HTMLInputElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const shareMenuRef = useRef<HTMLDivElement | null>(null)
  const shapeMenuRef = useRef<HTMLDivElement | null>(null)
  const hasBackgroundRef = useRef(false)
  const prefersReducedMotion = useReducedMotion()

  const currentUserId = user?.id ?? null
  const audienceAge = useMemo(() => parseAudienceAge(responseAge), [responseAge])
  const responseAgeInvalid = responseAge.trim().length > 0 && audienceAge === undefined
  const displayBoardName = useMemo(() => boardName.trim() || WHITEBOARD_APP_NAME, [boardName])

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
    async (messages: WhiteboardTutorMessage[] = [], mode: 'analysis' | 'tutor' | 'chat' = 'analysis') => {
      if (!boardId) throw new Error('Missing board id')
      if (!backgroundImageAsset) throw new Error('Import a photo first.')

      return analyzeWhiteboardPhoto(boardId, {
        imageDataUrl: backgroundImageAsset.dataUrl,
        imageMimeType: backgroundImageAsset.mimeType,
        imageName: backgroundImageAsset.name,
        audienceAge,
        messages,
        mode,
      })
    },
    [audienceAge, backgroundImageAsset, boardId],
  )

  const handleResponseAgeChange = useCallback((value: string) => {
    const normalized = value.replace(/[^\d]/g, '').slice(0, 2)
    setResponseAge(normalized)
  }, [])

  const handleAnnotationToolSelect = useCallback((tool: AnnotationTool) => {
    setAnnotationTool(tool)
    setShapeMenuOpen(false)
    whiteboardPadRef.current?.setAnnotationTool(tool)
  }, [])

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
    if (!isOwner) return
    setRenameError(null)
    setRenameDraft(boardName)
    setIsRenaming(true)
  }, [boardName, isOwner])

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
    setBackgroundImageAsset(asset)
  }, [])

  const handleWhiteboardAccessDenied = useCallback(() => {
    setAccessState('denied')
    setRealtimeStatus('offline')
  }, [])

  const handlePhotoUploadClick = useCallback(() => {
    photoUploadInputRef.current?.click()
  }, [])

  const handlePhotoFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setPhotoUploadError(null)
    resetTutorState()

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
  }, [handleAnnotationToolSelect, resetTutorState])

  const handleRemovePhoto = useCallback(() => {
    whiteboardPadRef.current?.clearBackground()
    setBackgroundImageAsset(null)
    setHasBackground(false)
    setConfirmRemovePhoto(false)
    setPhotoGuidanceVisible(false)
    setPhotoGuidanceFading(false)
    resetTutorState()
  }, [resetTutorState])

  const handleRemovePhotoRequest = useCallback(() => {
    setConfirmRemovePhoto(true)
  }, [])

  const handleCancelRemovePhoto = useCallback(() => {
    setConfirmRemovePhoto(false)
  }, [])

  const handleStartAnalysis = useCallback(async () => {
    if (!backgroundImageAsset) return
    setAnalysisLoading(true)
    setAnalysisError(null)
    setPhotoGuidanceVisible(false)
    setPhotoGuidanceFading(false)
    try {
      const response = await runTutorRequest([], 'analysis')
      setAnalysis(response)
      handleAnnotationToolSelect('pen')
    } catch (error) {
      setAnalysisError(getFriendlyTutorErrorMessage(error, 'The tutor could not read that photo yet. Please try again.'))
    } finally {
      setAnalysisLoading(false)
    }
  }, [backgroundImageAsset, handleAnnotationToolSelect, runTutorRequest])

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

  const renderHeader = () => (
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
              {isOwner ? (
                <button
                  type="button"
                  onClick={handleRenameStart}
                  className="rounded-md p-1.5 text-chess-muted transition-colors hover:bg-chess-surface hover:text-white"
                  aria-label="Rename whiteboard"
                  title="Rename whiteboard"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="order-3 flex w-full justify-center md:order-2 md:flex-1">
          {hasBackground ? (
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-2">
              <ToolButton active={annotationTool === 'pen'} label="Pen" onClick={() => handleAnnotationToolSelect('pen')} icon={<PenTool className="h-4 w-4" />} />
              <ToolButton active={annotationTool === 'highlighter'} label="Highlighter" onClick={() => handleAnnotationToolSelect('highlighter')} icon={<Highlighter className="h-4 w-4" />} />
              <ToolButton active={annotationTool === 'text'} label="Text" onClick={() => handleAnnotationToolSelect('text')} icon={<Type className="h-4 w-4" />} />
              <ToolButton active={annotationTool === 'eraser'} label="Eraser" onClick={() => handleAnnotationToolSelect('eraser')} icon={<Eraser className="h-4 w-4" />} />
              <div className="relative" ref={shapeMenuRef}>
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
              {confirmRemovePhoto ? (
                <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
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
          ) : (
            <button
              onClick={handlePhotoUploadClick}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
              type="button"
            >
              <Camera className="h-4 w-4" />
              Add photo to annotate
            </button>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 md:max-w-[30%]">
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
          <button
            onClick={handleOpenInvite}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
            aria-label="Invite"
          >
            <Users className="h-4 w-4" />
            Invite
          </button>
          <div className="relative" ref={shareMenuRef}>
            <button
              type="button"
              onClick={() => setShareMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-xl bg-chess-surface px-3 py-2 text-sm font-medium text-white transition hover:bg-chess-surfaceSoft"
              aria-expanded={shareMenuOpen}
              aria-haspopup="menu"
            >
              <Share2 className="h-4 w-4" />
              Share
              <ChevronDown className="h-4 w-4" />
            </button>
            {shareMenuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-2xl" role="menu" aria-label="Share actions">
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

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="relative min-w-0 flex-1">
            <WhiteboardPad
              ref={whiteboardPadRef}
              boardId={boardId}
              className="h-full"
              annotationMode={hasBackground}
              onRealtimeStatusChange={handleRealtimeStatusChange}
              onHasBackgroundChange={handleBackgroundChange}
              onBackgroundImageAssetChange={handleBackgroundImageAssetChange}
              onAccessDenied={handleWhiteboardAccessDenied}
            />

            {photoGuidanceVisible ? (
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
          </div>

          <RightSidePanel
            hasPhoto={hasBackground}
            analysis={analysis}
            analysisLoading={analysisLoading}
            analysisError={analysisError}
            onStartAnalysis={() => {
              void handleStartAnalysis()
            }}
            onRetryAnalysis={() => {
              void handleStartAnalysis()
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
            onRequestHumanTutor={() => {
              return undefined
            }}
            onTabChange={(_tab: TabType) => undefined}
          />
        </div>
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