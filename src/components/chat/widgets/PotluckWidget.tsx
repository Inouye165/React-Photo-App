import { useCallback, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Circle,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
} from 'lucide-react'
import type { ChatRoomMetadata, PotluckAllergy, PotluckItem } from '../../../types/chat'
import LocationMapPanel from '../../LocationMapPanel'

interface PotluckWidgetProps {
  metadata: ChatRoomMetadata
  currentUserId: string | null
  memberDirectory?: Record<string, string | null>
  memberProfiles?: Record<string, { avatarUrl: string | null }>
  ownerIds?: Set<string>
  onUpdate: (meta: ChatRoomMetadata) => Promise<void>
  isExpanded?: boolean
  onToggleExpand?: () => void
  showLocationMap?: boolean
}

export default function PotluckWidget({
  metadata,
  currentUserId,
  memberDirectory,
  memberProfiles,
  ownerIds,
  onUpdate,
  isExpanded,
  onToggleExpand,
  showLocationMap = true,
}: PotluckWidgetProps) {
  const potluck = metadata.potluck || { items: [], allergies: [] }
  const items = potluck.items || []
  const location = potluck.location
  const hostNotes = potluck.hostNotes
  const allergies = potluck.allergies || []

  const [newItemLabel, setNewItemLabel] = useState('')
  const [newAllergyLabel, setNewAllergyLabel] = useState('')
  const [isCollapsed, setIsCollapsed] = useState(false)

  const itemSummary = useMemo(() => {
    const total = items.length
    const needed = items.filter((item) => !item.claimedByUserId).length
    const itemLabel = total === 1 ? 'item' : 'items'
    const needLabel = needed === 1 ? 'need' : 'needs'
    return `${total} ${itemLabel}, ${needed} ${needLabel}`
  }, [items])

  const formattedHostDate = useMemo(() => {
    if (!hostNotes?.createdAt) return null
    const date = new Date(hostNotes.createdAt)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  }, [hostNotes?.createdAt])

  const resolveClaimedBy = useCallback(
    (userId: string | null) => {
      if (!userId) return null
      if (currentUserId && userId === currentUserId) return 'You'
      const username = memberDirectory?.[userId]
      return username?.trim() || 'Unknown'
    },
    [currentUserId, memberDirectory],
  )

  const isAdminClaim = useCallback(
    (userId: string | null) => {
      if (!userId) return false
      return ownerIds?.has(userId) ?? false
    },
    [ownerIds],
  )

  const handleClaim = async (itemId: string) => {
    if (!currentUserId) return
    const updatedItems = items.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          claimedByUserId: item.claimedByUserId === currentUserId ? null : currentUserId,
        }
      }
      return item
    })

    await onUpdate({ ...metadata, potluck: { ...potluck, items: updatedItems } })
  }

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemLabel.trim()) return

    const newItem: PotluckItem = {
      id: crypto.randomUUID(),
      label: newItemLabel.trim(),
      claimedByUserId: null,
    }

    const updatedItems = [...items, newItem]
    await onUpdate({ ...metadata, potluck: { ...potluck, items: updatedItems } })
    setNewItemLabel('')
  }

  const handleAddAllergy = async (e: React.FormEvent) => {
    e.preventDefault()
    const label = newAllergyLabel.trim()
    if (!label) return

    const normalized = label.toLowerCase()
    const exists = allergies.some((entry) => entry.label.trim().toLowerCase() === normalized)
    if (exists) {
      setNewAllergyLabel('')
      return
    }

    const newAllergy: PotluckAllergy = {
      id: crypto.randomUUID(),
      label,
      addedByUserId: currentUserId ?? null,
      createdAt: new Date().toISOString(),
    }

    const updatedAllergies = [...allergies, newAllergy]
    await onUpdate({ ...metadata, potluck: { ...potluck, allergies: updatedAllergies } })
    setNewAllergyLabel('')
  }

  const addressLabel = location?.address?.trim() || null
  const hasLatLng =
    location != null &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng)

  const mapPhoto = hasLatLng
    ? { metadata: { latitude: location?.lat, longitude: location?.lng } }
    : null

  const hostNotesBlock = (
    <div className="rounded-xl border border-slate-200 bg-white/60 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Host Notes</h4>
        {formattedHostDate && <span className="text-xs text-slate-500">{formattedHostDate}</span>}
      </div>
      {hostNotes?.message ? (
        <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-line">{hostNotes.message}</p>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No host notes yet.</p>
      )}
      {hostNotes?.instructions ? (
        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-600">
          <div className="font-semibold text-slate-700">Special instructions</div>
          <p className="mt-1 whitespace-pre-line">{hostNotes.instructions}</p>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-orange-800 flex items-center gap-2">🍲 Potluck Board</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-orange-700 hover:bg-orange-100"
            aria-label={isCollapsed ? 'Expand potluck summary' : 'Collapse potluck summary'}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <span className="text-xs text-orange-600 font-medium">
            {items.filter((i) => i.claimedByUserId).length} / {items.length} items
          </span>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-orange-700 hover:bg-orange-100"
              aria-label={isExpanded ? 'Collapse potluck widget' : 'Expand potluck widget'}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        {isCollapsed ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">{itemSummary}</div>
            {hostNotesBlock}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_1.35fr_0.9fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">Dishes</h4>
              <span className="text-xs text-slate-500">{items.length} total</span>
            </div>

            <ul className="space-y-2">
              {items.map((item) => {
                const isClaimed = !!item.claimedByUserId
                const isClaimedByMe = item.claimedByUserId === currentUserId
                const claimedByLabel = resolveClaimedBy(item.claimedByUserId ?? null)
                const claimedByAdmin = isAdminClaim(item.claimedByUserId ?? null)
                const claimedByAvatar = item.claimedByUserId
                  ? memberProfiles?.[item.claimedByUserId]?.avatarUrl ?? null
                  : null
                const claimButtonLabel = isClaimedByMe
                  ? "I'm bringing this"
                  : isClaimed
                    ? `Claimed by ${claimedByLabel ?? 'Unknown'}`
                    : 'Claim item'

                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-orange-50/60"
                  >
                    <div className="min-w-0">
                      <div className={`text-sm ${isClaimed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {item.label}
                      </div>
                      {isClaimed && claimedByLabel && (
                        <div
                          className={
                            claimedByAdmin
                              ? 'text-xs text-emerald-700 font-semibold mt-0.5 truncate'
                              : 'text-xs text-slate-600 font-medium mt-0.5 truncate'
                          }
                        >
                          {'Claimed by '}
                          <span className={claimedByAdmin ? 'text-emerald-700' : 'text-slate-700'}>
                            {claimedByLabel}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleClaim(item.id)}
                      disabled={isClaimed && !isClaimedByMe}
                      aria-label={claimButtonLabel}
                      className={
                        claimedByAvatar && !isClaimedByMe
                          ? `
                          h-10 w-10 rounded-full border transition-colors flex items-center justify-center
                          ${
                            isClaimed
                              ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600'
                          }
                        `
                          : `
                          text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1
                          ${
                            isClaimedByMe
                              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                              : isClaimed
                                ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600'
                          }
                        `
                      }
                    >
                      {isClaimedByMe ? (
                        <>
                          <CheckCircle className="w-3 h-3" /> I'm bringing this
                        </>
                      ) : isClaimed ? (
                        claimedByAvatar ? (
                          <img
                            src={claimedByAvatar}
                            alt={`Claimed by ${claimedByLabel ?? 'member'}`}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <>
                            <CheckCircle className="w-3 h-3" /> Claimed
                          </>
                        )
                      ) : (
                        <>
                          <Circle className="w-3 h-3" /> Claim
                        </>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>

            <form onSubmit={handleAddItem} className="flex gap-2 pt-2 border-t border-slate-100">
              <input
                type="text"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                placeholder="Add item (e.g. Napkins)"
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                aria-label="Add item"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>
          </div>

          <div className="space-y-4">
            {hostNotesBlock}
            <div className="rounded-xl border border-slate-200 bg-white/60 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <h4 className="text-sm font-semibold text-slate-800">Allergies & restrictions</h4>
                </div>
                <span className="text-xs text-slate-500">{allergies.length} noted</span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {allergies.length === 0 ? (
                  <span className="text-sm text-slate-500">No allergies listed.</span>
                ) : (
                  allergies.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs"
                    >
                      {entry.label}
                    </span>
                  ))
                )}
              </div>

              <form onSubmit={handleAddAllergy} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newAllergyLabel}
                  onChange={(e) => setNewAllergyLabel(e.target.value)}
                  placeholder="Add allergy (e.g. peanuts)"
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <button
                  type="submit"
                  className="p-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                  aria-label="Add allergy"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {showLocationMap && (
            <div className="flex lg:justify-end">
              {hasLatLng ? (
                <div className="rounded-lg overflow-hidden aspect-square w-full max-w-[240px] border border-slate-200 relative">
                  <LocationMapPanel photo={mapPhoto} />
                  <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur text-xs p-1 px-2 truncate border-t border-slate-200">
                    <MapPin className="w-3 h-3 inline mr-1 text-slate-500" />
                    {addressLabel ?? 'Address pending'}
                  </div>
                </div>
              ) : (
                <div className="aspect-square w-full max-w-[240px] rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center text-xs text-slate-500 px-3 text-center">
                  <div>Map location pending</div>
                  {addressLabel ? (
                    <div className="mt-1 text-[11px] text-slate-500 truncate w-full">{addressLabel}</div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
