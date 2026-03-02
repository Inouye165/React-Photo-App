import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

export type RoomMemberSummary = {
  userId: string
  username: string | null
  avatarUrl: string | null
  isOwner?: boolean
}

export type RoomUserSearchResult = {
  id: string
  username: string | null
  avatar_url: string | null
}

type RoomMembersModalProps = {
  isOpen: boolean
  onClose: () => void
  roomTitle?: string
  currentUserId: string | null
  canInvite: boolean
  members: RoomMemberSummary[]
  onInviteDenied?: () => void
  onSearchUsers: (query: string) => Promise<RoomUserSearchResult[]>
  onInviteMember: (userId: string) => Promise<void>
}

const SEARCH_DEBOUNCE_MS = 300

function resolveDisplayName(member: RoomMemberSummary, currentUserId: string | null): string {
  if (currentUserId && member.userId === currentUserId) return 'You'
  return member.username?.trim() || 'Unknown'
}

export default function RoomMembersModal({
  isOpen,
  onClose,
  roomTitle,
  currentUserId,
  canInvite,
  members,
  onInviteDenied,
  onSearchUsers,
  onInviteMember,
}: RoomMembersModalProps) {
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<RoomUserSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const memberIds = useMemo(() => new Set(members.map((member) => member.userId)), [members])

  useEffect(() => {
    if (!isOpen) {
      setSearchText('')
      setSearchResults([])
      setSearchError(null)
      setActionError(null)
      setActionMessage(null)
      setActionBusyId(null)
      return
    }

    const q = searchText.trim()
    if (!q) {
      setSearchResults([])
      setSearchLoading(false)
      setSearchError(null)
      return
    }

    const timer = window.setTimeout(() => {
      setSearchLoading(true)
      setSearchError(null)

      onSearchUsers(q)
        .then((results) => {
          setSearchResults(results)
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          setSearchError(message)
          setSearchResults([])
        })
        .finally(() => {
          setSearchLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isOpen, onSearchUsers, searchText])

  if (!isOpen) return null

  async function handleInvite(userId: string): Promise<void> {
    if (!canInvite) {
      onInviteDenied?.()
      return
    }

    try {
      setActionBusyId(userId)
      setActionError(null)
      setActionMessage(null)
      await onInviteMember(userId)
      setActionMessage('Invited')
      setSearchResults((prev) => prev.filter((entry) => entry.id !== userId))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
    } finally {
      setActionBusyId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Invite members"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Invite members</h2>
            <p className="mt-1 text-xs text-slate-500">
              {roomTitle?.trim() ? `Manage access for ${roomTitle.trim()}.` : 'Manage room access.'}
            </p>
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

        {!canInvite && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only the owner can invite.
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <label htmlFor="room-members-search" className="text-sm font-semibold text-slate-900">
              Search users
            </label>
            <input
              id="room-members-search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by username"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              aria-label="Search users"
            />

            {searchLoading && <div className="mt-2 text-sm text-slate-500">Searching…</div>}
            {searchError && <div className="mt-2 text-sm text-red-600">{searchError}</div>}
            {actionError && <div className="mt-2 text-sm text-red-600">{actionError}</div>}
            {actionMessage && <div className="mt-2 text-sm text-emerald-700">{actionMessage}</div>}

            {!searchLoading && searchText.trim() && !searchError && searchResults.length === 0 && (
              <div className="mt-2 text-sm text-slate-500">No matches found.</div>
            )}

            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map((result) => {
                  const isAlreadyMember = memberIds.has(result.id)
                  const isSelf = Boolean(currentUserId && result.id === currentUserId)
                  const disabled = isAlreadyMember || isSelf || Boolean(actionBusyId)

                  return (
                    <div key={result.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                      {result.avatar_url ? (
                        <img
                          src={result.avatar_url}
                          alt=""
                          className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-slate-200" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {result.username?.trim() || 'Unknown'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleInvite(result.id)}
                        disabled={disabled}
                        className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        {isSelf ? 'You' : isAlreadyMember ? 'Added' : 'Invite'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-900">Current members</h3>
            {members.length === 0 ? (
              <div className="mt-2 text-sm text-slate-500">No members yet.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {members.map((member) => (
                  <div key={member.userId} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-slate-200" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {resolveDisplayName(member, currentUserId)}
                        {member.isOwner ? (
                          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            Owner
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
