import { create } from 'zustand'
import { updatePhotoState } from './api.js'

// Minimal Zustand store for photos and ui state (polling, toast)
const useStore = create((set) => ({
  photos: [],
  toastMsg: '',
  toastSeverity: 'info',
  // Support both a single legacy polling id and a Set of polling ids for concurrent polling
  pollingPhotoId: null,
  pollingPhotoIds: new Set(),

  // Photos slice
  setPhotos: (photos) => set({ photos }),
  removePhotoById: (id) => set((state) => ({ photos: state.photos.filter(p => p.id !== id) })),
  // Update existing photo data or insert if missing (upsert)
  updatePhotoData: (id, newData) => set((state) => {
    const exists = state.photos.some(p => p.id === id)
    if (exists) {
      return { photos: state.photos.map(p => p.id === id ? { ...p, ...newData } : p) }
    }
    // Append updated/inserted photo to the list so editors can observe it
    return { photos: [...state.photos, typeof newData === 'object' ? { ...newData, id } : newData] }
  }),

  // UI slice
  // setToast accepts either a string (legacy) or an object { message, severity }
  setToast: (msg) => {
    if (typeof msg === 'string') return set({ toastMsg: msg });
    if (!msg) return set({ toastMsg: '' });
    const message = msg.message || '';
    const severity = msg.severity || 'info';
    return set({ toastMsg: message, toastSeverity: severity });
  },
  setPollingPhotoId: (id) => set({ pollingPhotoId: id }),

  // Manage pollingPhotoIds immutably so Zustand subscribers detect changes
  addPollingId: (id) => set((state) => {
    const newSet = new Set(state.pollingPhotoIds || []);
    newSet.add(id);
    return { pollingPhotoIds: newSet };
  }),
  removePollingId: (id) => set((state) => {
    const newSet = new Set(state.pollingPhotoIds || []);
    newSet.delete(id);
    return { pollingPhotoIds: newSet };
  }),

  // Action: move a photo to inprogress and start polling for AI results
  moveToInprogress: async (id) => {
    try {
      await updatePhotoState(id, 'inprogress')
      // remove locally and set polling trigger
      set((state) => {
        const newSet = new Set(state.pollingPhotoIds || []);
        newSet.add(id);
        return { photos: state.photos.filter(p => p.id !== id), pollingPhotoId: id, pollingPhotoIds: newSet };
      })
      return { success: true }
    } catch (err) {
      set({ toastMsg: `Error moving photo: ${err?.message || err}` })
      return { success: false, error: err }
    }
  }
}))

export default useStore
