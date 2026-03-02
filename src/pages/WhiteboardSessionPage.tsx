import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import WhiteboardPad from '../components/whiteboard/WhiteboardPad'
import { ensureWhiteboardMembership } from '../api/whiteboards'
import { addRoomMember, listRoomMembers, searchUsers, type UserSearchResult } from '../api/chat'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabaseClient'
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
  const [boardName, setBoardName] = useState<string>('Whiteboard')
  const [members, setMembers] = useState<RoomMemberSummary[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')
  const inviteDeniedLoggedRef = useRef(false)

  const currentUserId = user?.id ?? null

  const realtimeIndicator = useMemo(() => {
    if (realtimeStatus === 'connected') {
      return {
        label: 'Connected',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      }
    }

    if (realtimeStatus === 'offline') {
      return {
        label: 'Offline',
        className: 'border-slate-300 bg-slate-100 text-slate-600',
      }
    }

    return {
      label: 'Connecting…',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }, [realtimeStatus])

  const refreshMembers = useCallback(async () => {
    if (!boardId) return

    const [roomResult, memberRows] = await Promise.all([
      supabase
        .from('rooms')
        .select('name, created_by')
        .eq('id', boardId)
        .maybeSingle(),
      listRoomMembers(boardId),
    ])

    if (roomResult.error) {
      throw roomResult.error
    }

    const room = roomResult.data as { name?: unknown; created_by?: unknown } | null
    const createdBy = typeof room?.created_by === 'string' ? room.created_by : null
    const resolvedName = typeof room?.name === 'string' && room.name.trim() ? room.name.trim() : 'Whiteboard'

    setBoardName(resolvedName)

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

  if (accessState === 'checking') {
    return (
      <div className="h-[100dvh] w-full bg-white p-4">
        <div className="mx-auto max-w-3xl">
          <button onClick={() => navigate('/whiteboards')} className="rounded border px-2 py-1">Back</button>
          <div className="mt-4 text-slate-700">Checking whiteboard access…</div>
        </div>
      </div>
    )
  }

  if (accessState === 'denied') {
    return (
      <div className="h-[100dvh] w-full bg-white p-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-lg font-semibold">No access</h2>
          <p className="mt-2 text-slate-700">You don’t have access to this whiteboard yet.</p>
          <button onClick={() => navigate('/whiteboards')} className="mt-4 rounded border px-3 py-2">Back to Whiteboards</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full bg-white">
      <div className="flex items-center gap-3 border-b p-3">
        <button onClick={() => navigate('/whiteboards')} className="rounded border px-2 py-1">Back</button>
        <h2 className="text-lg font-semibold">{boardName}</h2>
        <div className="ml-auto">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${realtimeIndicator.className}`}>
              {realtimeIndicator.label}
            </span>
            <button
              onClick={handleOpenInvite}
              className="rounded border px-2 py-1"
              aria-label="Invite"
            >
              Invite
            </button>
            <button
              onClick={() => {
                try {
                  void navigator.clipboard.writeText(window.location.href)
                } catch {
                  // ignore
                }
              }}
              className="rounded border px-2 py-1"
            >
              Copy board link
            </button>
          </div>
        </div>
      </div>

      {inviteNotice && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {inviteNotice}
        </div>
      )}

      <div className="h-[calc(100dvh-56px)]">
        <WhiteboardPad
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
    </div>
  )
}
