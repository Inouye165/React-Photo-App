import { useEffect, useMemo, useState } from 'react'
import { Check, MapPin, X } from 'lucide-react'
import type { ChatRoomMetadata, ChatRoomType } from '../../types/chat'

interface ChatSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  roomType: ChatRoomType
  metadata: ChatRoomMetadata | null
  currentUserId?: string | null
  onSave: (patch: { type: ChatRoomType; metadata: ChatRoomMetadata }) => Promise<void>
}

type MapboxSuggestion = {
  id: string
  fullAddress: string
  lat: number
  lng: number
  confidence: number
  featureType: string | null
}

type ParsedAddress = {
  addressLine1?: string
  place?: string
  region?: string
  postcode?: string
  country?: string
}

const normalizeAddress = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const parseStructuredAddress = (value: string): ParsedAddress => {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return {}

  const addressLine1 = parts[0]
  const place = parts[1]
  const regionPostal = parts[2]
  const country = parts.length > 3 ? parts.slice(3).join(', ') : undefined
  let region: string | undefined
  let postcode: string | undefined

  if (regionPostal) {
    const tokens = regionPostal.split(/\s+/).filter(Boolean)
    if (tokens.length > 1 && /\d/.test(tokens[tokens.length - 1])) {
      postcode = tokens.pop()
    }
    region = tokens.join(' ')
  }

  return {
    addressLine1,
    place,
    region: region || undefined,
    postcode,
    country,
  }
}

const isAddressFormatValid = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  const parsed = parseStructuredAddress(trimmed)
  const addressLine1 = parsed.addressLine1 || ''
  const hasStreet = /\d/.test(addressLine1)
  const hasCity = Boolean(parsed.place)
  return hasStreet && hasCity
}

export default function ChatSettingsModal({
  isOpen,
  onClose,
  roomType,
  metadata,
  currentUserId,
  onSave,
}: ChatSettingsModalProps) {
  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  const [selectedType, setSelectedType] = useState<ChatRoomType>(roomType)
  const [locationAddress, setLocationAddress] = useState<string>(metadata?.potluck?.location?.address || '')
  const [eventDetails, setEventDetails] = useState<string>(
    [metadata?.potluck?.hostNotes?.message, metadata?.potluck?.hostNotes?.instructions]
      .filter(Boolean)
      .join('\n\n')
  )
  const [suggestions, setSuggestions] = useState<MapboxSuggestion[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState<MapboxSuggestion | null>(null)
  const [bestSuggestion, setBestSuggestion] = useState<MapboxSuggestion | null>(null)
  const [isAddressFocused, setIsAddressFocused] = useState(false)
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [confidenceWarning, setConfidenceWarning] = useState<string | null>(null)
  const [didYouMean, setDidYouMean] = useState<string | null>(null)
  const [proximity, setProximity] = useState<{ lat: number; lng: number } | null>(null)

  const addressFormatValid = useMemo(() => isAddressFormatValid(locationAddress), [locationAddress])

  useEffect(() => {
    if (!isOpen) return
    setSelectedType(roomType)
    setLocationAddress(metadata?.potluck?.location?.address || '')
    setEventDetails(
      [metadata?.potluck?.hostNotes?.message, metadata?.potluck?.hostNotes?.instructions]
        .filter(Boolean)
        .join('\n\n')
    )
    setSuggestions([])
    setSelectedSuggestion(null)
    setBestSuggestion(null)
    setIsAddressFocused(false)
    setIsFetchingSuggestions(false)
    setSuggestionError(null)
    setConfidenceWarning(null)
    setDidYouMean(null)
  }, [
    isOpen,
    metadata?.potluck?.hostNotes?.instructions,
    metadata?.potluck?.hostNotes?.message,
    metadata?.potluck?.location?.address,
    roomType,
  ])

  useEffect(() => {
    if (!isOpen) return

    const existing = metadata?.potluck?.location
    if (existing?.lat != null && existing?.lng != null) {
      setProximity({ lat: Number(existing.lat), lng: Number(existing.lng) })
      return
    }

    if (!navigator?.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setProximity({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      () => {
        // ignore geolocation errors; fallback is no proximity bias
      },
      { maximumAge: 5 * 60 * 1000, timeout: 4000 }
    )
  }, [isOpen, metadata?.potluck?.location])

  useEffect(() => {
    if (!isOpen) return
    if (!mapboxToken) {
      setSuggestions([])
      setBestSuggestion(null)
      setSuggestionError(null)
      return
    }

    const query = locationAddress.trim()
    if (query.length < 3) {
      setSuggestions([])
      setBestSuggestion(null)
      setConfidenceWarning(null)
      setDidYouMean(null)
      setSuggestionError(null)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsFetchingSuggestions(true)
      setSuggestionError(null)
      try {
        const parsed = parseStructuredAddress(query)
        const params = new URLSearchParams()
        params.set('access_token', mapboxToken)
        params.set('types', 'address')
        params.set('limit', '5')
        params.set('autocomplete', 'true')
        params.set('language', 'en')

        if (parsed.addressLine1) {
          params.set('address_line1', parsed.addressLine1)
        } else {
          params.set('address_line1', query)
        }
        if (parsed.place) params.set('place', parsed.place)
        if (parsed.region) params.set('region', parsed.region)
        if (parsed.postcode) params.set('postcode', parsed.postcode)
        if (parsed.country) params.set('country', parsed.country)
        if (proximity) params.set('proximity', `${proximity.lng},${proximity.lat}`)

        const url = `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
          throw new Error('Unable to fetch address suggestions')
        }
        const json = (await res.json()) as {
          features?: Array<{
            id?: string
            geometry?: { coordinates?: number[] }
            properties?: {
              mapbox_id?: string
              full_address?: string
              place_formatted?: string
              name?: string
              feature_type?: string
              match_code?: { confidence?: number; score?: number }
            }
            place_name?: string
          }>
        }

        const nextSuggestions = (json.features || [])
          .map((feature) => {
            const coordinates = feature.geometry?.coordinates
            if (!coordinates || coordinates.length < 2) return null
            const [lng, lat] = coordinates
            const properties = feature.properties || {}
            const confidence =
              Number(properties.match_code?.confidence ?? properties.match_code?.score ?? 0) || 0
            return {
              id: String(properties.mapbox_id || feature.id || `${lat},${lng}`),
              fullAddress:
                properties.full_address ||
                properties.place_formatted ||
                feature.place_name ||
                properties.name ||
                query,
              lat,
              lng,
              confidence,
              featureType: properties.feature_type || null,
            }
          })
          .filter((item): item is MapboxSuggestion => Boolean(item))

        setSuggestions(nextSuggestions)
        const topSuggestion = nextSuggestions[0] || null
        setBestSuggestion(topSuggestion)

        if (topSuggestion) {
          if (topSuggestion.confidence < 0.8 || (topSuggestion.featureType && topSuggestion.featureType !== 'address')) {
            setConfidenceWarning('Low confidence match. Please confirm the address details.')
          } else {
            setConfidenceWarning(null)
          }

          const normalizedInput = normalizeAddress(query)
          const normalizedSuggestion = normalizeAddress(topSuggestion.fullAddress)
          if (normalizedInput && normalizedSuggestion && normalizedInput !== normalizedSuggestion) {
            setDidYouMean(topSuggestion.fullAddress)
          } else {
            setDidYouMean(null)
          }
        } else {
          setConfidenceWarning('No exact address match found. Please refine the address.')
          setDidYouMean(null)
        }
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') {
          setSuggestionError('Unable to load address suggestions. Please try again.')
          setSuggestions([])
          setBestSuggestion(null)
          setConfidenceWarning(null)
          setDidYouMean(null)
        }
      } finally {
        setIsFetchingSuggestions(false)
      }
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [isOpen, locationAddress, mapboxToken, proximity])

  if (!isOpen) return null

  const handleSave = async () => {
    const baseMetadata: ChatRoomMetadata = metadata ?? {}
    const newMetadata: ChatRoomMetadata = { ...baseMetadata }

    if (selectedType === 'potluck') {
      const trimmedDetails = eventDetails.trim()
      const trimmedLocation = locationAddress.trim()
      const existingHostNotes = newMetadata.potluck?.hostNotes
      const existingDetails = [existingHostNotes?.message, existingHostNotes?.instructions]
        .filter(Boolean)
        .join('\n\n')
      const hasHostUpdate =
        trimmedDetails !== existingDetails

      const resolvedSuggestion = selectedSuggestion || bestSuggestion
      const resolvedLocation = trimmedLocation
        ? resolvedSuggestion
          ? {
              address: resolvedSuggestion.fullAddress || trimmedLocation,
              lat: resolvedSuggestion.lat,
              lng: resolvedSuggestion.lng,
            }
          : {
              address: trimmedLocation,
              lat: null,
              lng: null,
            }
        : undefined

      newMetadata.potluck = {
        ...newMetadata.potluck,
        items: newMetadata.potluck?.items || [],
        allergies: newMetadata.potluck?.allergies || [],
        location: resolvedLocation,
        hostNotes: trimmedDetails
          ? hasHostUpdate
            ? {
                message: trimmedDetails,
                instructions: undefined,
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

        <div className="p-6 pb-5 space-y-5">
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
                <span className="inline-flex items-center gap-2">
                  {selectedType === 'general' && <Check className="h-4 w-4 text-blue-600" />}
                  <span>💬 General</span>
                </span>
              </button>
              <button
                onClick={() => setSelectedType('potluck')}
                className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedType === 'potluck'
                    ? 'border-orange-500 bg-orange-100 text-orange-800 ring-1 ring-orange-500'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {selectedType === 'potluck' && <Check className="h-4 w-4 text-orange-700" />}
                  <span>🍲 Potluck</span>
                </span>
              </button>
            </div>
          </div>

          {selectedType === 'potluck' && (
            <div className="space-y-5 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Event Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={locationAddress}
                    onChange={(e) => {
                      setLocationAddress(e.target.value)
                      setSelectedSuggestion(null)
                    }}
                    onFocus={() => setIsAddressFocused(true)}
                    onBlur={() => {
                      setIsAddressFocused(false)
                      setSuggestions([])
                    }}
                    placeholder="Enter address..."
                    className={`w-full pl-9 pr-4 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                      addressFormatValid ? 'border-slate-200' : 'border-amber-400'
                    }`}
                  />
                  {isAddressFocused && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-2 rounded-lg border border-slate-200 bg-white shadow-lg z-10 overflow-hidden">
                      <ul className="max-h-52 overflow-auto text-sm">
                        {suggestions.map((suggestion) => (
                          <li key={suggestion.id}>
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setLocationAddress(suggestion.fullAddress)
                                setSelectedSuggestion(suggestion)
                                setSuggestions([])
                                setIsAddressFocused(false)
                                setDidYouMean(null)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex flex-col"
                            >
                              <span className="text-slate-800">{suggestion.fullAddress}</span>
                              <span className="text-xs text-slate-500">
                                Confidence: {suggestion.confidence.toFixed(2)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {!addressFormatValid && locationAddress.trim() && (
                  <div className="text-sm text-amber-800">
                    Address looks incomplete. Use format like “123 Main St, City, CA”.
                  </div>
                )}
                {didYouMean && (
                  <div className="text-xs text-slate-600">
                    Did you mean:{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setLocationAddress(didYouMean)
                        setSelectedSuggestion(bestSuggestion)
                        setDidYouMean(null)
                      }}
                      className="text-blue-600 underline"
                    >
                      {didYouMean}
                    </button>
                    ?
                  </div>
                )}
                {confidenceWarning && (
                  <div className="text-sm text-amber-800">{confidenceWarning}</div>
                )}
                {suggestionError && (
                  <div className="text-xs text-red-600">{suggestionError}</div>
                )}
                {!mapboxToken && (
                  <div className="text-xs text-slate-500">
                    Address suggestions require VITE_MAPBOX_ACCESS_TOKEN.
                  </div>
                )}
                {isFetchingSuggestions && (
                  <div className="text-xs text-slate-500">Loading suggestions...</div>
                )}
                <p className="text-xs text-slate-500">
                  This will show a map at the top of the chat for all members.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Event Details &amp; Instructions</label>
                <textarea
                  value={eventDetails}
                  onChange={(e) => setEventDetails(e.target.value)}
                  placeholder="Share context, dietary notes, setup details, timing..."
                  rows={4}
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
