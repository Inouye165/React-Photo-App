import { useEffect, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import type { ChatRoomMetadata, ChatRoomType } from '../../types/chat'

interface ChatSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  roomType: ChatRoomType
  metadata: ChatRoomMetadata | null
  currentUserId?: string | null
  onSave: (patch: { type: ChatRoomType; metadata: ChatRoomMetadata }) => Promise<void>
}

export default function ChatSettingsModal({
  isOpen,
  onClose,
  roomType,
  metadata,
  currentUserId,
  onSave,
}: ChatSettingsModalProps) {
  const [selectedType, setSelectedType] = useState<ChatRoomType>(roomType)
  const [locationAddress, setLocationAddress] = useState<string>(metadata?.potluck?.location?.address || '')
  const [hostMessage, setHostMessage] = useState<string>(metadata?.potluck?.hostNotes?.message || '')
  const [hostInstructions, setHostInstructions] = useState<string>(metadata?.potluck?.hostNotes?.instructions || '')

  useEffect(() => {
    if (!isOpen) return
    setSelectedType(roomType)
    setLocationAddress(metadata?.potluck?.location?.address || '')
    setHostMessage(metadata?.potluck?.hostNotes?.message || '')
    setHostInstructions(metadata?.potluck?.hostNotes?.instructions || '')
  }, [
    isOpen,
    metadata?.potluck?.hostNotes?.instructions,
    metadata?.potluck?.hostNotes?.message,
    metadata?.potluck?.location?.address,
    roomType,
  ])

  if (!isOpen) return null

  const handleSave = async () => {
    const baseMetadata: ChatRoomMetadata = metadata ?? {}
    const newMetadata: ChatRoomMetadata = { ...baseMetadata }

    if (selectedType === 'potluck') {
      const trimmedMessage = hostMessage.trim()
      const trimmedInstructions = hostInstructions.trim()
      const existingHostNotes = newMetadata.potluck?.hostNotes
      const hasHostUpdate =
        trimmedMessage !== (existingHostNotes?.message ?? '') ||
        trimmedInstructions !== (existingHostNotes?.instructions ?? '')

      newMetadata.potluck = {
        ...newMetadata.potluck,
        items: newMetadata.potluck?.items || [],
        allergies: newMetadata.potluck?.allergies || [],
        location: locationAddress
          ? {
              address: locationAddress,
              lat: 37.7749,
              lng: -122.4194,
            }
          : undefined,
        hostNotes:
          trimmedMessage || trimmedInstructions
            ? hasHostUpdate
              ? {
                  message: trimmedMessage,
                  instructions: trimmedInstructions || undefined,
                  createdAt: new Date().toISOString(),
                  createdByUserId: currentUserId ?? existingHostNotes?.createdByUserId ?? null,
                }
              : existingHostNotes
            : undefined,
      }
    }

    await onSave({ type: selectedType, metadata: newMetadata })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Chat Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Chat Purpose</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedType('general')}
                className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedType === 'general'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                💬 General
              </button>
              <button
                onClick={() => setSelectedType('potluck')}
                className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedType === 'potluck'
                    ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-500'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                🍲 Potluck
              </button>
            </div>
          </div>

          {selectedType === 'potluck' && (
            <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Event Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={locationAddress}
                    onChange={(e) => setLocationAddress(e.target.value)}
                    placeholder="Enter address..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  This will show a map at the top of the chat for all members.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Host Notes</label>
                <textarea
                  value={hostMessage}
                  onChange={(e) => setHostMessage(e.target.value)}
                  placeholder="Share context for attendees..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 text-sm p-3 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Special Instructions</label>
                <textarea
                  value={hostInstructions}
                  onChange={(e) => setHostInstructions(e.target.value)}
                  placeholder="Dietary notes, setup details, timing..."
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 text-sm p-3 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
