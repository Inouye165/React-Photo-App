import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'

import {
  addRoomMember,
  quitRoom,
  removeRoomMember,
  searchUsers,
  setRoomOwner,
  type UserSearchResult,
} from '../../api'

export type ChatMemberSummary = {
  userId: string
  username: string | null
  avatarUrl: string | null
  isOwner: boolean
}

type ChatMembersModalProps = {
  isOpen: boolean
  onClose: () => void
  roomId: string
  isGroup: boolean
  currentUserId: string | null
  createdBy: string | null
  members: ChatMemberSummary[]
  onRefreshMembers: () => Promise<void>
}

function resolveDisplayName(member: ChatMemberSummary, currentUserId: string | null): string {
  if (currentUserId && member.userId === currentUserId) return 'You'
  return member.username?.trim() || 'Unknown'
}

export default function ChatMembersModal({
  isOpen,
  onClose,
  roomId,
  isGroup,
  currentUserId,
  createdBy,
  members,
  onRefreshMembers,
}: ChatMembersModalProps) {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  const memberIdSet = useMemo(() => new Set(members.map((m) => m.userId)), [members])
  const ownersCount = useMemo(() => members.filter((m) => m.isOwner).length, [members])
  const currentMember = useMemo(
    () => members.find((member) => member.userId === currentUserId) ?? null,
    [currentUserId, members],
  )

  const isOwner = Boolean(currentMember?.isOwner)
  const isCreator = Boolean(currentUserId && createdBy && currentUserId === createdBy)
  const isLastOwner = isOwner && ownersCount <= 1

  if (!isOpen) return null

  async function handleSearch(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    const q = searchText.trim()
    if (!q) return

    try {
      setSearchLoading(true)
      setSearchError(null)
      setActionError(null)
      const results = await searchUsers(q)
      setSearchResults(results)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSearchError(message)
    } finally {
      setSearchLoading(false)
    }
  }

  async function handleAddMember(userId: string): Promise<void> {
    try {
      setActionBusyId(`add-${userId}`)
      setActionError(null)
      await addRoomMember(roomId, userId)
      await onRefreshMembers()
      setSearchResults((prev) => prev.filter((user) => user.id !== userId))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionError(message)
    } finally {
      setActionBusyId(null)
    }
  }

  async function handleRemoveMember(userId: string): Promise<void> {
    try {
      setActionBusyId(`remove-${userId}`)
      setActionError(null)
      await removeRoomMember(roomId, userId)
      await onRefreshMembers()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionError(message)
    } finally {
      setActionBusyId(null)
    }
  }

  async function handleToggleOwner(userId: string, nextOwnerState: boolean): Promise<void> {
    try {
      setActionBusyId(`owner-${userId}`)
      setActionError(null)
      await setRoomOwner(roomId, userId, nextOwnerState)
      await onRefreshMembers()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionError(message)
    } finally {
      setActionBusyId(null)
    }
  }

  async function handleQuit(): Promise<void> {
    try {
      setActionBusyId('quit')
      setActionError(null)
      await quitRoom(roomId)
      onClose()
      navigate('/chat')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setActionError(message)
    } finally {
      setActionBusyId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-label="Chat members"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Members</h2>
            <p className="mt-1 text-xs text-slate-500">Manage who is in this group chat.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Close members"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!isGroup && (
          <div className="mt-4 text-sm text-slate-600">
            Member management is only available for group chats.
          </div>
        )}

        {isGroup && (
          <div className="mt-4 space-y-4">
            {actionError && <div className="text-sm text-red-600">{actionError}</div>}

            <div className="space-y-2">
              {members.map((member) => {
                const label = resolveDisplayName(member, currentUserId)
                const isSelf = Boolean(currentUserId && member.userId === currentUserId)
                const isMemberOwner = member.isOwner
                const ownerLabel = isMemberOwner ? `${label}` : label
                const canRemove = isOwner && !isSelf
                const canToggleOwner = isCreator && !isSelf
                const wouldBeLastOwner = isMemberOwner && ownersCount <= 1

                return (
                  <div
                    key={member.userId}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2"
                  >
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-slate-200" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {ownerLabel}
                        {isMemberOwner && (
                          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            Owner
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canToggleOwner && (
                        <button
                          type="button"
                          onClick={() => handleToggleOwner(member.userId, !member.isOwner)}
                          disabled={Boolean(actionBusyId) || (member.isOwner && wouldBeLastOwner)}
                          className={
                            member.isOwner
                              ? 'rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                              : 'rounded-lg bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50'
                          }
                        >
                          {member.isOwner ? 'Demote owner' : 'Promote to owner'}
                        </button>
                      )}
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member.userId)}
                          disabled={Boolean(actionBusyId) || (isMemberOwner && wouldBeLastOwner)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {isOwner && (
              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Add member</h3>
                <form className="mt-2 flex flex-col sm:flex-row gap-2" onSubmit={handleSearch}>
                  <input
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search usernames"
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    aria-label="Search users"
                  />
                  <button
                    type="submit"
                    disabled={searchLoading || !searchText.trim()}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {searchLoading ? 'Searching…' : 'Search'}
                  </button>
                </form>
                {searchError && <div className="mt-2 text-sm text-red-600">{searchError}</div>}
                {!searchLoading && searchResults.length === 0 && searchText.trim() && !searchError && (
                  <div className="mt-2 text-sm text-slate-500">No matches found.</div>
                )}
                {searchResults.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {searchResults.map((result) => {
                      const isAlreadyMember = memberIdSet.has(result.id)
                      const isSelf = Boolean(currentUserId && result.id === currentUserId)
                      const disabled = isAlreadyMember || isSelf || Boolean(actionBusyId)
                      return (
                        <div key={result.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                          {result.avatar_url ? (
                            <img
                              src={result.avatar_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-slate-200" aria-hidden="true" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {result.username?.trim() || 'Unknown'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddMember(result.id)}
                            disabled={disabled}
                            className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
                          >
                            {isSelf ? 'You' : isAlreadyMember ? 'Added' : 'Add'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={handleQuit}
                  disabled={Boolean(actionBusyId) || isLastOwner}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Quit chat
                </button>
                {isLastOwner && (
                  <div className="mt-1 text-xs text-slate-500">
                    Assign another owner before leaving this group.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
