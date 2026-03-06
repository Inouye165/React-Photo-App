import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Link, Users, Copy, Camera, Edit3 } from 'lucide-react'
import WhiteboardPad from '../components/whiteboard/WhiteboardPad'
import type { WhiteboardCanvasHandle } from '../components/whiteboard/WhiteboardCanvas'
import RightSidePanel, { type TabType } from '../components/whiteboard/RightSidePanel'
import { createWhiteboardInvite, ensureWhiteboardMembership, getWhiteboardSessionDetails, updateWhiteboardTitle } from '../api/whiteboards'
import { addRoomMember, listRoomMembers, searchUsers, type UserSearchResult } from '../api/chat'
import ChessUserMenu from '../components/ChessUserMenu'
import { useAuth } from '../contexts/AuthContext'
import RoomMembersModal, { type RoomMemberSummary } from '../components/rooms/RoomMembersModal'

type RealtimeStatus = 'connected' | 'connecting' | 'offline'

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

export default function WhiteboardSessionPage(): React.JSX.Element {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [boardName, setBoardName] = useState<string>('Untitled')
  const [members, setMembers] = useState<RoomMemberSummary[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const [joinLinkNotice, setJoinLinkNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('Untitled')
  const [isSavingRename, setIsSavingRename] = useState(false)
  const [isCreatingJoinLink, setIsCreatingJoinLink] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')
  const inviteDeniedLoggedRef = useRef(false)
  const whiteboardPadRef = useRef<WhiteboardCanvasHandle>(null)
  const photoUploadInputRef = useRef<HTMLInputElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

  const currentUserId = user?.id ?? null

  const realtimeIndicator = useMemo(() => {
    if (realtimeStatus === 'connected') {
      return {
        label: 'Connected',
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      }
    }

    if (realtimeStatus === 'offline') {
      return {
        label: 'Offline',
        className: 'border-chess-muted/30 bg-chess-surfaceSoft text-chess-muted',
      }
    }

    return {
      label: 'Connecting…',
      className: 'border-chess-accent/30 bg-chess-accent/10 text-chess-accentSoft',
    }
  }, [realtimeStatus])

  const refreshMembers = useCallback(async () => {
    if (!boardId) return

    const [room, memberRows] = await Promise.all([getWhiteboardSessionDetails(boardId), listRoomMembers(boardId)])
    const createdBy = typeof room?.created_by === 'string' ? room.created_by : null
    const resolvedName = typeof room?.name === 'string' && room.name.trim() ? room.name.trim() : 'Untitled'

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

  if (!boardId) return <div>Missing board id</div>

  useEffect(() => {
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

  const handleCreateJoinLink = useCallback(async () => {
    if (!isOwner) {
      setJoinLinkNotice({ tone: 'error', message: 'Only the owner can create a join link.' })
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
      console.warn('[WB-JOIN] create-link-failed', {
        boardId,
        code: details.code,
        status: details.status,
        message: details.message,
      })
      // If backend explicitly returns 403, surface a clearer UX message for non-owners.
      if (details.status === 403) {
        setJoinLinkNotice({ tone: 'error', message: 'Only the owner can create a join link for this board.' })
      } else {
        setJoinLinkNotice({ tone: 'error', message: details.message || 'Unable to create join link.' })
      }
    } finally {
      setIsCreatingJoinLink(false)
    }
  }, [boardId, isOwner])

  const handleTabChange = useCallback((tab: TabType) => {
    console.log('Active tab changed to:', tab)
    // Future: Handle tab-specific logic here
  }, [])

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
    if (!isOwner) {
      setIsRenaming(false)
      return
    }

    const trimmed = renameDraft.trim()
    const currentTitle = boardName.trim() || 'Untitled'

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

  const handlePhotoUploadClick = useCallback(() => {
    photoUploadInputRef.current?.click()
  }, [])

  const handlePhotoFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setPhotoUploadError(null)
    try {
      if (!whiteboardPadRef.current) {
        throw new Error('Whiteboard is not ready yet.')
      }
      await whiteboardPadRef.current.insertImageFile(file)
    } catch (error) {
      setPhotoUploadError(error instanceof Error ? error.message : 'Unable to add photo to the whiteboard.')
    }
  }, [])

  const pageClassName = 'h-[100dvh] w-full bg-chess-bg font-body text-chess-text'

  if (accessState === 'checking') {
    return (
      <motion.div 
        className={pageClassName}
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/12">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/whiteboards')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back</span>
              </button>
              <h1 className="text-xl font-semibold font-display">Checking Access</h1>
            </div>
            <ChessUserMenu
              onOpenPhotos={() => navigate('/photos')}
              onOpenEdit={() => navigate('/edit')}
              onOpenAdmin={() => navigate('/admin')}
              showAdminQuickAction={false}
            />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-chess-muted mb-2">Checking whiteboard access…</div>
            </div>
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
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/12">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/whiteboards')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back</span>
              </button>
              <h1 className="text-xl font-semibold font-display">Access Denied</h1>
            </div>
            <ChessUserMenu
              onOpenPhotos={() => navigate('/photos')}
              onOpenEdit={() => navigate('/edit')}
              onOpenAdmin={() => navigate('/admin')}
              showAdminQuickAction={false}
            />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <Users className="w-12 h-12 mx-auto mb-4 text-chess-muted/50" />
              <h2 className="text-lg font-medium mb-2">No Access</h2>
              <p className="text-chess-muted mb-6">You don't have access to this whiteboard.</p>
              <button 
                onClick={() => navigate('/whiteboards')} 
                className="px-4 py-2 rounded-lg bg-chess-accent hover:bg-chess-accentSoft transition-colors text-white font-medium"
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
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/12">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/whiteboards')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameDraft}
                  disabled={isSavingRename}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
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
                  className="min-w-[220px] max-w-[40vw] rounded-lg border border-white/12 bg-chess-surface px-3 py-2 text-xl font-semibold font-display text-white outline-none ring-0 transition-colors focus:border-chess-accent"
                  aria-label="Whiteboard name"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-xl font-semibold font-display truncate">{boardName}</h1>
                {isOwner && (
                  <button
                    type="button"
                    onClick={handleRenameStart}
                    className="rounded-md p-1.5 text-chess-muted transition-colors hover:bg-chess-surface hover:text-white"
                    aria-label="Rename whiteboard"
                    title="Rename whiteboard"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
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
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${realtimeIndicator.className}`}>
              {realtimeIndicator.label}
            </span>
            <button
              onClick={handlePhotoUploadClick}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
              aria-label="Upload or take photo"
              title="Upload or take photo"
              type="button"
            >
              <Camera className="w-4 h-4" />
              <span className="text-sm font-medium">Photo</span>
            </button>
            <button
              onClick={handleOpenInvite}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
              aria-label="Invite"
            >
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">Invite</span>
            </button>
            {isOwner && (
              <button
                onClick={() => {
                  void handleCreateJoinLink()
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
                disabled={isCreatingJoinLink}
              >
                <Link className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {isCreatingJoinLink ? 'Creating…' : 'Create join link'}
                </span>
              </button>
            )}
            <button
              onClick={() => {
                try {
                  void navigator.clipboard.writeText(window.location.href)
                } catch {
                  // ignore
                }
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chess-surface hover:bg-chess-surfaceSoft transition-colors"
            >
              <Copy className="w-4 h-4" />
              <span className="text-sm font-medium">Copy link</span>
            </button>
            <ChessUserMenu
              onOpenPhotos={() => navigate('/photos')}
              onOpenEdit={() => navigate('/edit')}
              onOpenAdmin={() => navigate('/admin')}
              showAdminQuickAction={false}
            />
          </div>
        </div>

        {/* Notices */}
        {inviteNotice && (
          <div className="border-b border-chess-accent/30 bg-chess-accent/10 px-4 py-3 text-sm text-chess-accentSoft">
            {inviteNotice}
          </div>
        )}

        {joinLinkNotice && (
          <div
            className={`border-b px-4 py-3 text-sm ${
              joinLinkNotice.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            {joinLinkNotice.message}
          </div>
        )}

        {photoUploadError && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {photoUploadError}
          </div>
        )}

        {renameError && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {renameError}
          </div>
        )}

        {/* Whiteboard Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Main Canvas Area */}
          <div className="flex-1 min-w-0">
            <WhiteboardPad
              ref={whiteboardPadRef}
              boardId={boardId}
              className="h-full"
              onRealtimeStatusChange={(status) => {
                setRealtimeStatus(status)
              }}
              onAccessDenied={() => {
                setAccessState('denied')
                setRealtimeStatus('offline')
              }}
            />
          </div>
          
          {/* Right Side Panel */}
          <RightSidePanel onTabChange={handleTabChange} />
        </div>
      </div>

      <RoomMembersModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roomTitle={boardName}
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
