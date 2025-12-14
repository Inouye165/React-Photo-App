import { useEffect } from 'react'

/**
 * useLockBodyScroll
 *
 * Locks document body scrolling while `locked` is true, restoring the previous
 * overflow value on cleanup.
 *
 * Intentionally mirrors the prior `EditPage.jsx` behavior (try/catch + restore).
 */
export function useLockBodyScroll(locked = true) {
  useEffect(() => {
    if (!locked) return

    const prev = document.body.style.overflow
    try {
      document.body.style.overflow = 'hidden'
    } catch (error) {
      console.warn('Failed to set body overflow:', error)
    }

    return () => {
      try {
        document.body.style.overflow = prev || ''
      } catch (error) {
        console.warn('Failed to restore body overflow:', error)
      }
    }
  }, [locked])
}
