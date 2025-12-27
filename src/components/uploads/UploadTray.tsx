import { useMemo, useState } from 'react'
import useStore from '../../store'

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const rounded = unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[unitIndex]}`
}

export default function UploadTray() {
  const backgroundUploads = useStore((state) => state.backgroundUploads)
  const clearCompleted = useStore((state) => state.clearCompletedBackgroundUploads)
  const retryFailedInStore = useStore((state) => state.retryFailedBackgroundUploads)
  const markSuccess = useStore((state) => state.markBackgroundUploadSuccess)
  const markError = useStore((state) => state.markBackgroundUploadError)

  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const counts = useMemo(() => {
    const list = Array.isArray(backgroundUploads) ? backgroundUploads : []
    const uploading = list.filter((u) => u.status === 'uploading').length
    const success = list.filter((u) => u.status === 'success').length
    const error = list.filter((u) => u.status === 'error').length
    return { total: list.length, uploading, success, error }
  }, [backgroundUploads])

  const hasAny = counts.total > 0
  const canRetry = counts.error > 0
  const canClear = counts.success > 0

  const handleRetryFailed = async () => {
    if (retrying || !canRetry) return

    const failed = (Array.isArray(backgroundUploads) ? backgroundUploads : []).filter((u) => u.status === 'error')
    if (failed.length === 0) return

    setRetrying(true)
    try {
      // Update UI immediately.
      retryFailedInStore()

      const { uploadPhotoToServer } = await import('../../api')
      const { generateClientThumbnail } = await import('../../utils/clientImageProcessing')

      for (const entry of failed) {
        let thumbnailBlob: Blob | null = null
        try {
          thumbnailBlob = await generateClientThumbnail(entry.file)
        } catch {
          // Continue without thumbnail
        }

        try {
          await uploadPhotoToServer(entry.file, undefined, thumbnailBlob, { classification: entry.classification })
          markSuccess(entry.id)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          markError(entry.id, message)
        }
      }
    } finally {
      setRetrying(false)
    }
  }

  if (!hasAny && !open) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 pointer-events-none">
      <div className="pointer-events-auto sm:max-w-sm">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full sm:w-auto min-h-[44px] rounded-full bg-slate-900 text-white px-4 py-2 text-sm font-medium shadow"
            aria-label={`Open upload tray. ${counts.total} uploads in queue.`}
          >
            Uploads ({counts.total})
          </button>
        ) : (
          <div className="w-full rounded-xl border border-slate-200 bg-white shadow">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">Upload queue</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200"
                aria-label="Close upload tray"
              >
                Close
              </button>
            </div>

            <div className="sr-only" aria-live="polite">
              {`${counts.uploading} uploading, ${counts.success} completed, ${counts.error} failed.`}
            </div>

            <div className="max-h-64 overflow-auto">
              <ul className="divide-y divide-slate-100">
                {(backgroundUploads || []).map((u) => (
                  <li key={u.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{u.filename}</div>
                        <div className="text-xs text-slate-500">
                          {formatBytes(u.size)}
                          {u.classification ? ` • ${u.classification}` : ''}
                        </div>
                        <div className="mt-1 text-xs text-slate-600" role="status">
                          {u.status === 'uploading' ? 'Uploading…' : u.status === 'success' ? 'Completed' : 'Failed'}
                          {u.status === 'error' && u.errorMessage ? `: ${u.errorMessage}` : ''}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-xs text-slate-400">{new Date(u.startedAt).toLocaleTimeString()}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleRetryFailed}
                disabled={!canRetry || retrying}
                className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium bg-slate-900 text-white disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                {retrying ? 'Retrying…' : 'Retry failed'}
              </button>
              <button
                type="button"
                onClick={clearCompleted}
                disabled={!canClear}
                className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium bg-transparent text-slate-700 border border-slate-300 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear completed
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
