import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Circle, MapPin, Plus } from 'lucide-react'
import type { ChatRoomMetadata, PotluckAllergy, PotluckItem } from '../../../types/chat'
import LocationMapPanel from '../../LocationMapPanel'

interface PotluckWidgetProps {
  metadata: ChatRoomMetadata
  currentUserId: string | null
  onUpdate: (meta: ChatRoomMetadata) => Promise<void>
}

export default function PotluckWidget({ metadata, currentUserId, onUpdate }: PotluckWidgetProps) {
  const potluck = metadata.potluck || { items: [], allergies: [] }
  const items = potluck.items || []
  const location = potluck.location
  const hostNotes = potluck.hostNotes
  const allergies = potluck.allergies || []

  const [newItemLabel, setNewItemLabel] = useState('')
  const [newAllergyLabel, setNewAllergyLabel] = useState('')

  const formattedHostDate = useMemo(() => {
    if (!hostNotes?.createdAt) return null
    const date = new Date(hostNotes.createdAt)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  }, [hostNotes?.createdAt])

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

  const mapPhoto = location
    ? { metadata: { latitude: location.lat, longitude: location.lng } }
    : null

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-4">
      <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-orange-800 flex items-center gap-2">🍲 Potluck Board</h3>
        <span className="text-xs text-orange-600 font-medium">
          {items.filter((i) => i.claimedByUserId).length} / {items.length} items
        </span>
      </div>

      <div className="p-4">
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

                return (
                  <li key={item.id} className="flex items-center justify-between gap-3">
                    <span className={`text-sm ${isClaimed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {item.label}
                    </span>

                    <button
                      onClick={() => handleClaim(item.id)}
                      disabled={isClaimed && !isClaimedByMe}
                      className={`
                        text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1
                        ${
                          isClaimedByMe
                            ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                            : isClaimed
                              ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600'
                        }
                      `}
                    >
                      {isClaimedByMe ? (
                        <>
                          <CheckCircle className="w-3 h-3" /> I'm bringing this
                        </>
                      ) : isClaimed ? (
                        <>
                          <CheckCircle className="w-3 h-3" /> Claimed
                        </>
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
            <div className="rounded-xl border border-slate-200 bg-white/60 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Host Notes</h4>
                {formattedHostDate && <span className="text-xs text-slate-500">{formattedHostDate}</span>}
              </div>
              {hostNotes?.message ? (
                <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {hostNotes.message}
                </p>
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

          <div className="flex lg:justify-end">
            {location && location.lat && location.lng ? (
              <div className="rounded-lg overflow-hidden aspect-square w-full max-w-[240px] border border-slate-200 relative">
                <LocationMapPanel photo={mapPhoto} />
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur text-xs p-1 px-2 truncate border-t border-slate-200">
                  <MapPin className="w-3 h-3 inline mr-1 text-slate-500" />
                  {location.address}
                </div>
              </div>
            ) : (
              <div className="aspect-square w-full max-w-[240px] rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-500">
                Map location pending
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
