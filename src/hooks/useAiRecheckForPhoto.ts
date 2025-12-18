import { useState, useEffect, useRef } from 'react'
import useStore from '../store'
import type { Photo } from '../types/photo'

interface UseAiRecheckForPhotoParams {
  photoId: number | string
  aiReady: boolean
  onRecheckAI?: (photoId: number | string, model: string | null) => Promise<void>
  sourcePhoto?: Photo
  onAiUpdateDetected?: (updates: { caption?: string; description?: string; keywords?: string }) => void
}

interface UseAiRecheckForPhotoResult {
  isPolling: boolean
  recheckingAI: boolean
  handleRecheckAi: () => void
}

/**
 * Phase 3: Extracted AI recheck + polling + post-AI form-sync logic.
 * 
 * Encapsulates:
 * - recheckingAI state and click handler for "Recheck AI" button
 * - polling detection (isPolling) derived from Zustand store (Set + legacy support)
 * - previous-photo comparison logic (prevPhotoRef) to detect AI updates
 * - timeout logic (doneTimeoutRef) + cleanup on unmount
 * - "when polling stops and AI updated fields → update form state" behavior
 * 
 * Security: No token exposure, no sensitive logging. Relies on httpOnly cookies (unchanged).
 */
export function useAiRecheckForPhoto({
  photoId,
  aiReady,
  onRecheckAI,
  sourcePhoto,
  onAiUpdateDetected,
}: UseAiRecheckForPhotoParams): UseAiRecheckForPhotoResult {
  // Local state for recheck button interaction
  const [recheckingAI, setRecheckingAI] = useState<boolean>(false)
  
  // Zustand polling flags: support both Set `pollingPhotoIds` and legacy `pollingPhotoId`
  const pollingPhotoIds = useStore(state => state.pollingPhotoIds)
  const pollingPhotoId = useStore(state => state.pollingPhotoId)
  
  // Compute isPolling from both sources
  const isPolling = 
    (pollingPhotoIds && pollingPhotoIds.has && pollingPhotoIds.has(photoId)) || 
    pollingPhotoId === photoId

  // Refs for tracking previous photo state and timeout cleanup
  const prevPhotoRef = useRef<Photo | undefined>(sourcePhoto)
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Handle recheck AI button click
  const handleRecheckAi = () => {
    if (!aiReady || !onRecheckAI) return
    
    setRecheckingAI(true)
    onRecheckAI(photoId, null).finally(() => setRecheckingAI(false))
  }

  // Watch polling state and photo updates to detect AI completion
  useEffect(() => {
    // If polling started for this photo, clear any pending done timeout
    if (isPolling) {
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current)
        doneTimeoutRef.current = null
      }
      return
    }

    // Polling stopped; check if AI updated the photo
    const prev = prevPhotoRef.current
    if (
      prev && 
      sourcePhoto &&
      (prev.caption !== sourcePhoto.caption || 
       prev.description !== sourcePhoto.description || 
       prev.keywords !== sourcePhoto.keywords)
    ) {
      // AI updated fields -> notify parent to update form state
      const updates: { caption?: string; description?: string; keywords?: string } = {}
      
      if (prev.caption !== sourcePhoto.caption) {
        updates.caption = sourcePhoto.caption || ''
      }
      if (prev.description !== sourcePhoto.description) {
        updates.description = sourcePhoto.description || ''
      }
      if (prev.keywords !== sourcePhoto.keywords) {
        updates.keywords = sourcePhoto.keywords || ''
      }

      // Notify parent component to apply updates
      if (onAiUpdateDetected) {
        try {
          onAiUpdateDetected(updates)
        } catch {
          // Swallow errors from missing values
        }
      }

      // Show 'done' state briefly (2.5s), then revert to idle
      doneTimeoutRef.current = setTimeout(() => {
        doneTimeoutRef.current = null
      }, 2500)
    }
  }, [isPolling, sourcePhoto, onAiUpdateDetected])

  // Keep previous photo reference updated
  useEffect(() => {
    prevPhotoRef.current = sourcePhoto
  }, [sourcePhoto])

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current)
        doneTimeoutRef.current = null
      }
    }
  }, [])

  return {
    isPolling,
    recheckingAI,
    handleRecheckAi,
  }
}
