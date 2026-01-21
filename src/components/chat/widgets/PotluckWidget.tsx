import { useState } from 'react'
import { CheckCircle, Circle, MapPin, Plus } from 'lucide-react'
import type { ChatRoomMetadata, PotluckItem } from '../../../types/chat'
import LocationMapPanel from '../../LocationMapPanel'

interface PotluckWidgetProps {
  metadata: ChatRoomMetadata
  currentUserId: string | null
  onUpdate: (meta: ChatRoomMetadata) => Promise<void>
}

export default function PotluckWidget({ metadata, currentUserId, onUpdate }: PotluckWidgetProps) {
  const potluck = metadata.potluck || { items: [] }
  const items = potluck.items || []
  const location = potluck.location

  const [newItemLabel, setNewItemLabel] = useState('')

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

      <div className="p-4 space-y-4">
        {location && location.lat && location.lng && (
          <div className="rounded-lg overflow-hidden h-32 relative border border-slate-200">
            <LocationMapPanel photo={mapPhoto} />
            <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur text-xs p-1 px-2 truncate border-t border-slate-200">
              <MapPin className="w-3 h-3 inline mr-1 text-slate-500" />
              {location.address}
            </div>
          </div>
        )}

        <ul className="space-y-2">
          {items.map((item) => {
            const isClaimed = !!item.claimedByUserId
            const isClaimedByMe = item.claimedByUserId === currentUserId

            return (
              <li key={item.id} className="flex items-center justify-between group">
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
    </div>
  )
}
