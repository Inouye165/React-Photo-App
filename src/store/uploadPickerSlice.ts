import { nanoid } from 'nanoid'
import type { StoreApi } from 'zustand'

export type UploadPickerStatus = 'closed' | 'idle' | 'selecting' | 'uploading' | 'complete' | 'error'

export interface UploadPickerLocalPhoto {
  id: string
  name: string
  file: File
  exifDate: string | null
  handle: unknown | null
}

export type UploadQueueItemStatus = 'pending' | 'uploading' | 'success' | 'error'

export interface UploadQueueItem {
  id: string
  status: UploadQueueItemStatus
  error: string | null
}

export interface UploadPickerFilters {
  startDate: string
  endDate: string
}

export interface UploadPickerMetrics {
  totalSelected: number
  uploadedCount: number
  failedCount: number
}

export interface UploadPickerState {
  status: UploadPickerStatus
  selectedDirHandle: unknown | null
  localPhotos: UploadPickerLocalPhoto[]
  filters: UploadPickerFilters
  uploadQueue: UploadQueueItem[]
  metrics: UploadPickerMetrics
  error: string | null
}

export interface UploadPickerOpenArgs {
  dirHandle?: unknown | null
  files?: Array<
    {
      id?: string
      name: string
      file: File
      exifDate?: string | null
      handle?: unknown | null
    }
  >
}

export interface UploadPickerCommand {
  openPicker: (args: UploadPickerOpenArgs) => void
  closePicker: (reason?: string) => void
  resetPicker: () => void
  setFilters: (filters: Partial<UploadPickerFilters>) => void
  queuePhotos: (files?: UploadPickerOpenArgs['files']) => void
  startUpload: (args: { ids?: string[] }) => void
  markUploadSuccess: (id: string) => void
  markUploadFailure: (id: string, error: string) => void
  finishUploads: (status?: UploadPickerStatus) => void
}

export interface UploadPickerSlice {
  uploadPicker: UploadPickerState
  pickerCommand: UploadPickerCommand
}

export const uploadPickerInitialState: UploadPickerState = {
  status: 'closed',
  selectedDirHandle: null,
  localPhotos: [],
  filters: {
    startDate: '',
    endDate: '',
  },
  uploadQueue: [],
  metrics: {
    totalSelected: 0,
    uploadedCount: 0,
    failedCount: 0,
  },
  error: null,
}

type SetState<T> = StoreApi<T>['setState']
type GetState<T> = StoreApi<T>['getState']

type UploadPickerHostState = {
  uploadPicker: UploadPickerState
  pickerCommand: UploadPickerCommand
}

export const createUploadPickerSlice = <T extends UploadPickerHostState>(
  set: SetState<T>,
  get: GetState<T>,
): UploadPickerSlice => ({
  uploadPicker: { ...uploadPickerInitialState },
  pickerCommand: {
    openPicker: ({ dirHandle, files }: UploadPickerOpenArgs) => {
      const normalized: UploadPickerLocalPhoto[] = Array.isArray(files)
        ? files
            .filter((file): file is NonNullable<typeof file> => Boolean(file))
            .map((file) => ({
              id: file.id || nanoid(),
              name: file.name,
              file: file.file,
              exifDate: file.exifDate || null,
              handle: file.handle || null,
            }))
        : []

      set((state) => ({
        uploadPicker: {
          ...state.uploadPicker,
          status: 'idle',
          selectedDirHandle: dirHandle || null,
          localPhotos: normalized,
          uploadQueue: normalized.map((item) => ({ id: item.id, status: 'pending', error: null })),
          filters: { startDate: '', endDate: '' },
          metrics: {
            totalSelected: normalized.length,
            uploadedCount: 0,
            failedCount: 0,
          },
          error: null,
        },
      }) as Partial<T>)
    },
    closePicker: (_reason = 'user-dismissed') => {
      const current = get().uploadPicker
      if (current.status === 'closed') return
      set(() => ({
        uploadPicker: { ...uploadPickerInitialState },
      }) as Partial<T>)
    },
    resetPicker: () => {
      set(() => ({ uploadPicker: { ...uploadPickerInitialState } } as Partial<T>))
    },
    setFilters: ({ startDate = '', endDate = '' }: Partial<UploadPickerFilters>) => {
      set((state) => ({
        uploadPicker: {
          ...state.uploadPicker,
          filters: { startDate, endDate },
        },
      }) as Partial<T>)
    },
    queuePhotos: (files = []) => {
      if (!Array.isArray(files) || files.length === 0) return
      set((state) => {
        const queued: UploadPickerLocalPhoto[] = files.map((file) => ({
          id: file.id || nanoid(),
          name: file.name,
          file: file.file,
          exifDate: file.exifDate || null,
          handle: file.handle || null,
        }))
        const uploadQueue: UploadQueueItem[] = queued.map((item) => ({ id: item.id, status: 'pending', error: null }))
        return {
          uploadPicker: {
            ...state.uploadPicker,
            localPhotos: queued,
            uploadQueue,
            metrics: {
              ...state.uploadPicker.metrics,
              totalSelected: queued.length,
            },
            status: 'idle',
          },
        } as Partial<T>
      })
    },
    startUpload: ({ ids }: { ids?: string[] }) => {
      const targetIds = Array.isArray(ids) && ids.length > 0 ? ids : null
      set((state) => {
        const nextQueue = state.uploadPicker.uploadQueue.map((item) => {
          if (targetIds && !targetIds.includes(item.id)) return item
          return { ...item, status: 'uploading', error: null }
        })
        return {
          uploadPicker: {
            ...state.uploadPicker,
            status: 'uploading',
            uploadQueue: nextQueue,
            error: null,
          },
        } as Partial<T>
      })
    },
    markUploadSuccess: (id: string) => {
      set((state) => {
        const nextQueue = state.uploadPicker.uploadQueue.map((item) => {
          if (item.id !== id) return item
          return { ...item, status: 'success', error: null }
        })
        return {
          uploadPicker: {
            ...state.uploadPicker,
            uploadQueue: nextQueue,
            metrics: {
              ...state.uploadPicker.metrics,
              uploadedCount: state.uploadPicker.metrics.uploadedCount + 1,
            },
          },
        } as Partial<T>
      })
    },
    markUploadFailure: (id: string, error: string) => {
      set((state) => {
        const nextQueue = state.uploadPicker.uploadQueue.map((item) => {
          if (item.id !== id) return item
          return { ...item, status: 'error', error: error || 'Upload failed' }
        })
        return {
          uploadPicker: {
            ...state.uploadPicker,
            uploadQueue: nextQueue,
            metrics: {
              ...state.uploadPicker.metrics,
              failedCount: state.uploadPicker.metrics.failedCount + 1,
            },
            error: error || 'Upload failed',
            status: 'error',
          },
        } as Partial<T>
      })
    },
    finishUploads: (status: UploadPickerStatus = 'complete') => {
      set((state) => ({
        uploadPicker: {
          ...state.uploadPicker,
          status,
        },
      }) as Partial<T>)
    },
  },
})
