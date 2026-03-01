import { X, Link as LinkIcon, Copy } from 'lucide-react'

type Member = { userId: string; username: string | null; avatarUrl?: string | null; isOwner?: boolean }

interface Props {
  isOpen: boolean
  onClose: () => void
  roomId: string | null
  title?: string
  members: Member[]
  roomType?: string | null
  metadata?: Record<string, any>
  createdBy?: string | null
}

export default function ChatRoomInfoPanel({ isOpen, onClose, roomId, title = 'Room info', members, roomType, metadata, createdBy }: Props) {
  if (!isOpen || !roomId) return null

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId)
    } catch {
      // ignore
    }
  }

  const copyLink = async () => {
    try {
      const href = `${window.location.origin}/chat/${roomId}`
      await navigator.clipboard.writeText(href)
    } catch {
      // ignore
    }
  }

  const showPotluck = roomType === 'potluck' && metadata && Array.isArray(metadata.potluck?.items) && metadata.potluck.items.length > 0
  const showLocation = roomType === 'potluck' && metadata && metadata.potluck?.location && Number.isFinite(metadata.potluck.location.lat) && Number.isFinite(metadata.potluck.location.lng)
  const showCollab = roomType === 'collaboration'

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-slate-900/30" onClick={onClose} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ml-auto h-full w-full sm:w-96 bg-white shadow-xl border-l border-slate-200 overflow-auto"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyRoomId}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <Copy className="h-3 w-3" /> Copy id
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <LinkIcon className="h-3 w-3" /> Copy link
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center h-8 w-8 rounded-xl text-slate-600 hover:bg-slate-100"
              aria-label="Close room info"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <h4 className="text-xs font-medium text-slate-600">Members</h4>
            <div className="mt-2 space-y-2">
              {members.length === 0 ? (
                <div className="text-sm text-slate-500">No members</div>
              ) : (
                members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center text-xs text-slate-600">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.username ?? ''} className="h-full w-full object-cover" />
                      ) : (
                        (m.username || 'U').slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-slate-900 truncate">{m.username ?? 'Unknown'}</div>
                      {m.isOwner && <div className="text-xs text-emerald-700">Owner</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {showPotluck && (
            <div>
              <h4 className="text-xs font-medium text-slate-600">Potluck</h4>
              <div className="mt-2 text-sm text-slate-700">
                <div>Items: {(metadata.potluck.items || []).length}</div>
              </div>
            </div>
          )}

          {showLocation && (
            <div>
              <h4 className="text-xs font-medium text-slate-600">Location</h4>
              <div className="mt-2 text-sm text-slate-700">
                <div>{metadata.potluck.location.address ?? 'Location set'}</div>
              </div>
            </div>
          )}

          {showCollab && (
            <div>
              <h4 className="text-xs font-medium text-slate-600">Collaboration</h4>
              <div className="mt-2 text-sm text-slate-700">Pad mode available</div>
            </div>
          )}

          <div className="pt-2 text-xs text-slate-500">Created by: {createdBy ?? 'Unknown'}</div>
        </div>
      </aside>
    </div>
  )
}
