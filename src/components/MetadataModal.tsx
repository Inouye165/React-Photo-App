import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import type { Photo } from '../types/photo'

const FOCUSABLE_SELECTOR = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'

export interface MetadataModalProps {
  photo: Photo | null | undefined
  onClose: () => void
}

export default function MetadataModal({ photo, onClose }: MetadataModalProps): ReactElement | null {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!photo) return
    if (typeof document === 'undefined') return

    const previouslyFocused = document.activeElement

    const focusInitial = () => {
      try {
        closeButtonRef.current?.focus()
      } catch {
        // ignore
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const root = dialogRef.current
      if (!root) return

      const focusable = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (node): node is HTMLElement => node instanceof HTMLElement && !node.hasAttribute('disabled'),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !(active instanceof HTMLElement) || !root.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    focusInitial()
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      try {
        if (previouslyFocused instanceof HTMLElement) {
          previouslyFocused.focus()
        }
      } catch {
        // ignore
      }
    }
  }, [photo, onClose])

  if (!photo) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ zIndex: 100 }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-lg p-6 max-w-2xl w-full m-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-modal-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="metadata-modal-title" className="text-xl font-bold">Photo Metadata</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="text-2xl text-gray-500 hover:text-gray-700"
            type="button"
            aria-label="Close metadata dialog"
          >
            &times;
          </button>
        </div>
        <div className="space-y-2 text-sm">
          <p><strong>Filename:</strong> {photo.filename}</p>
          <p><strong>File Size:</strong> {photo.file_size}</p>
          <p><strong>State:</strong> {photo.state}</p>
          <p><strong>Hash:</strong> <span className="font-mono text-xs break-all">{photo.hash || 'N/A'}</span></p>
          {photo.metadata?.DateTimeOriginal && (
            <p><strong>Date Taken:</strong> {photo.metadata.DateTimeOriginal}</p>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300" type="button">Close</button>
        </div>
      </div>
    </div>
  )
}
