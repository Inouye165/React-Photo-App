import { nanoid } from 'nanoid'

export const uploadPickerInitialState = {
  status: 'closed', // closed | idle | selecting | uploading | complete | error
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

export const createUploadPickerSlice = (set, get) => ({
  uploadPicker: { ...uploadPickerInitialState },
  pickerCommand: {
    openPicker: ({ dirHandle, files }) => {
      const normalized = Array.isArray(files) ? files.map((file) => ({
        id: file.id || nanoid(),
        name: file.name,
        file: file.file,
        exifDate: file.exifDate || null,
        handle: file.handle || null,
      })) : []

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
      }))
    },
    closePicker: (_reason = 'user-dismissed') => {
      const current = get().uploadPicker
      if (current.status === 'closed') return
      set(() => ({
        uploadPicker: { ...uploadPickerInitialState },
      }))
    },
    resetPicker: () => {
      set(() => ({ uploadPicker: { ...uploadPickerInitialState } }))
    },
    setFilters: ({ startDate = '', endDate = '' }) => {
      set((state) => ({
        uploadPicker: {
          ...state.uploadPicker,
          filters: { startDate, endDate },
        },
      }))
    },
    queuePhotos: (files = []) => {
      if (!Array.isArray(files) || files.length === 0) return
      set((state) => {
        const queued = files.map((file) => ({
          id: file.id || nanoid(),
          name: file.name,
          file: file.file,
          exifDate: file.exifDate || null,
          handle: file.handle || null,
        }))
        const uploadQueue = queued.map((item) => ({ id: item.id, status: 'pending', error: null }))
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
        }
      })
    },
    startUpload: ({ ids }) => {
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
        }
      })
    },
    markUploadSuccess: (id) => {
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
        }
      })
    },
    markUploadFailure: (id, error) => {
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
        }
      })
    },
    finishUploads: (status = 'complete') => {
      set((state) => ({
        uploadPicker: {
          ...state.uploadPicker,
          status,
        },
      }))
    },
  },
})
