import { useEffect, useRef } from 'react'
import useStore from '../store.js'
import { getPhoto } from '../api.js'

// Hook: poll backend for AI results when store.pollingPhotoId is set
export default function useAIPolling() {
  const pollingPhotoId = useStore(state => state.pollingPhotoId)
  const updatePhotoData = useStore(state => state.updatePhotoData)
  const setPollingPhotoId = useStore(state => state.setPollingPhotoId)
  const setToast = useStore(state => state.setToast)
  const attemptsRef = useRef(0)

  useEffect(() => {
    if (!pollingPhotoId) return
    let cancelled = false
    attemptsRef.current = 0
    const MAX_ATTEMPTS = 40

    const hasAIData = (p) => {
      if (!p) return false
      const c = (p.caption || '').toString().trim()
      const d = (p.description || '').toString().trim()
      const k = (p.keywords || '').toString().trim()
      return Boolean(c || d || k)
    }

    const checkOnce = async () => {
      attemptsRef.current += 1
      try {
        const res = await getPhoto(pollingPhotoId)
        if (!res) return
        // Normalize to a single photo object
        let updated = null
        if (res.photo) updated = res.photo
        else if (res.photos && Array.isArray(res.photos)) updated = res.photos.find(x => x.id === pollingPhotoId) || null
        else updated = res

        if (!updated) return

        if (hasAIData(updated)) {
          if (cancelled) return
          updatePhotoData(updated.id, updated)
          setPollingPhotoId(null)
          setToast('AI processing completed')
          return
        }

        if (attemptsRef.current >= MAX_ATTEMPTS) {
          if (cancelled) return
          setPollingPhotoId(null)
          setToast('AI job still running — stopped polling after timeout')
          return
        }
      } catch (err) {
        // If the photo was deleted or not found (404), stop polling.
        const msg = err && err.message ? String(err.message) : ''
        if (msg.includes('404')) {
          if (!cancelled) {
            setPollingPhotoId(null)
            setToast('Photo not found — stopped polling')
          }
          return
        }
        console.warn('AIPolling getPhoto failed', err)
      }
    }

    // Start immediately, then on interval
    checkOnce()
    const iv = setInterval(checkOnce, 3000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [pollingPhotoId, updatePhotoData, setPollingPhotoId, setToast])
}
