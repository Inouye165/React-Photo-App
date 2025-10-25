import { create } from 'zustand'
import { updatePhotoState } from './api.js'

// Minimal Zustand store for photos and ui state (polling, toast)
const useStore = create((set) => ({
  photos: [],
  toastMsg: '',
  pollingPhotoId: null,

  // Photos slice
  setPhotos: (photos) => set({ photos }),
  removePhotoById: (id) => set((state) => ({ photos: state.photos.filter(p => p.id !== id) })),
  updatePhotoData: (id, newData) => set((state) => ({ photos: state.photos.map(p => p.id === id ? { ...p, ...newData } : p) })),

  // UI slice
  setToast: (msg) => set({ toastMsg: msg }),
  setPollingPhotoId: (id) => set({ pollingPhotoId: id }),

  // Action: move a photo to inprogress and start polling for AI results
  moveToInprogress: async (id) => {
    try {
      await updatePhotoState(id, 'inprogress')
      // remove locally and set polling trigger
      set((state) => ({ photos: state.photos.filter(p => p.id !== id), pollingPhotoId: id }))
      return { success: true }
    } catch (err) {
      set({ toastMsg: `Error moving photo: ${err?.message || err}` })
      return { success: false, error: err }
    }
  }
}))

export default useStore
