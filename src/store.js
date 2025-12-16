import { create } from 'zustand'
import { getPhoto, updatePhotoState } from './api.js'
import { createUploadPickerSlice } from './store/uploadPickerSlice.js'

/** @typedef {import('./types/photo').Photo} Photo */

const debug = (...args) => {
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug(...args)
  }
}

// Module-level timer registry for AI polling so we can stop polling
// when analysis completes.
const aiPollingTimers = new Map();

const isAiAnalysisComplete = (photo) => {
  const caption = typeof photo?.caption === 'string' ? photo.caption.trim() : '';
  const description = typeof photo?.description === 'string' ? photo.description.trim() : '';

  // Treat any non-empty caption+description as completion, including failure fallbacks.
  if (!caption || !description) return false;
  if (caption === 'Processing...' || description === 'Processing...') return false;
  return true;
};

// Minimal Zustand store for photos and ui state (polling, toast)
const useStore = create((set, get) => ({
  ...createUploadPickerSlice(set, get),
  photos: [],
  toast: { message: '', severity: 'info' },
  // Support both a single legacy polling id and a Set of polling ids for concurrent polling
  pollingPhotoId: null,
  pollingPhotoIds: new Set(),

  // Optimistic uploads - pending photos being uploaded
  pendingUploads: [],
  addPendingUploads: (files) => {
    const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    const now = Date.now();
    const createdAt = new Date().toISOString();

    const newPending = safeFiles.map((file) => {
      const id = `temp-${now}-${Math.random().toString(36).substr(2, 9)}`;
      return {
        id,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        filename: file.name,
        state: 'uploading',
        created_at: createdAt,
        file_size: file.size,
        caption: '',
        isTemporary: true,
      };
    });

    set((state) => ({ pendingUploads: [...newPending, ...(state.pendingUploads || [])] }));
    return newPending;
  },
  removePendingUpload: (tempId) => set((state) => {
    // Revoke blob URL to prevent memory leak
    const pending = state.pendingUploads.find(p => p.id === tempId);
    if (pending?.url && pending.url.startsWith('blob:')) {
      URL.revokeObjectURL(pending.url);
    }
    return { pendingUploads: state.pendingUploads.filter(p => p.id !== tempId) };
  }),
  clearPendingUploads: () => set((state) => {
    // Revoke all blob URLs
    state.pendingUploads.forEach(p => {
      if (p.url && p.url.startsWith('blob:')) {
        URL.revokeObjectURL(p.url);
      }
    });
    return { pendingUploads: [] };
  }),

  // Persistent banner notification (alternative to toast)
  banner: { message: '', severity: 'info' },
  setBanner: (value) => set((state) => {
    const base = state.banner || { message: '', severity: 'info' };
    if (!value) return { banner: { message: '', severity: base.severity || 'info' } };
    if (typeof value === 'string') {
      return { banner: { message: value, severity: base.severity || 'info' } };
    }
    const message = typeof value.message === 'string' ? value.message : '';
    const severity = typeof value.severity === 'string' ? value.severity : (base.severity || 'info');
    return { banner: { message, severity } };
  }),

  // UI State Slice - View Management
  // NOTE: Initial view is null - URL params are the source of truth
  // SmartRouter determines the initial view and sets it via URL
  view: null, // null | 'working' | 'inprogress' | 'finished'
  setView: (view) => set({ view }),

  // UI State Slice - Active Photo & Editing
  activePhotoId: null,
  setActivePhotoId: (id) => set({ activePhotoId: id }),
  editingMode: null, // null | 'inline' | 'full'
  setEditingMode: (mode) => set({ editingMode: mode }),
  
  // Last edited photo - persists across navigation for quick return
  lastEditedPhotoId: null,
  setLastEditedPhotoId: (id) => set({ lastEditedPhotoId: id }),

  // UI State Slice - Modals
  showMetadataModal: false,
  setShowMetadataModal: (show) => set({ showMetadataModal: show }),
  metadataPhoto: null,
  setMetadataPhoto: (photo) => set({ metadataPhoto: photo }),

  // UI State Slice - Toolbar Messages
  toolbarMessage: '',
  setToolbarMessage: (message) => set({ toolbarMessage: message }),
  toolbarSeverity: 'info',
  setToolbarSeverity: (severity) => set({ toolbarSeverity: severity }),

  // Photos slice
  setPhotos: (photos) => set({ photos }),
  removePhotoById: (id) => set((state) => ({ photos: state.photos.filter(p => p.id !== id) })),
  // Update existing photo data or insert if missing (upsert)
  updatePhotoData: (id, newData) => set((state) => {
    const normalizeId = (value) => value != null ? String(value) : value;
    const targetId = normalizeId(id);
    const exists = state.photos.some(p => normalizeId(p.id) === targetId);
    debug('[store] updatePhotoData', { id, exists, newData, prePhotos: state.photos });
    if (exists) {
      const out = {
        photos: state.photos.map(p => {
          if (normalizeId(p.id) !== targetId) return p;
          const merged = { ...p, ...newData };
          merged.id = p.id;
          debug('[store] merged photo', merged);
          return merged;
        })
      };
      debug('[store] post-update photos', out.photos);
      return out;
    }
    // Append updated/inserted photo to the list so editors can observe it
    const appended = { photos: [...state.photos, typeof newData === 'object' ? { ...newData, id } : newData] };
    debug('[store] appending new photo:', appended, 'to', state.photos);
    return appended;
  }),
  // Replace an existing photo object in the photos array with the full updated object
  updatePhoto: (updatedPhoto) => set((state) => {
    if (!updatedPhoto || typeof updatedPhoto.id === 'undefined') return {};
    const normalizeId = (value) => value != null ? String(value) : value;
    const targetId = normalizeId(updatedPhoto.id);
    const photos = state.photos.map(p => {
      if (normalizeId(p.id) !== targetId) return p;
      const merged = { ...p, ...updatedPhoto };
      merged.id = p.id;
      debug('[store] updatePhoto merged', { prev: p, next: merged });
      return merged;
    });
    debug('[store] updatePhoto', { id: updatedPhoto.id, photos });
    return { photos };
  }),

  // UI slice
  // setToast accepts either a string (legacy) or an object { message, severity }
  setToast: (value) => set((state) => {
    const base = state.toast || { message: '', severity: 'info' };
    if (!value) return { toast: { message: '', severity: base.severity || 'info' } };
    if (typeof value === 'string') {
      return { toast: { message: value, severity: base.severity || 'info' } };
    }
    const message = typeof value.message === 'string' ? value.message : '';
    const severity = typeof value.severity === 'string' ? value.severity : (base.severity || 'info');
    return { toast: { message, severity } };
  }),
  setPollingPhotoId: (id) => set({ pollingPhotoId: id }),

  // Manage pollingPhotoIds immutably so Zustand subscribers detect changes
  addPollingId: (id) => set((state) => {
    const newSet = new Set(state.pollingPhotoIds || []);
    newSet.add(id);
    return { pollingPhotoIds: newSet };
  }),
  removePollingId: (id) => set((state) => {
    const current = state.pollingPhotoIds || new Set();
    const filtered = Array.from(current).filter((value) => String(value) !== String(id));
    return { pollingPhotoIds: new Set(filtered) };
  }),

  // Start polling /photos/:id until AI metadata is present.
  startAiPolling: (id, opts = {}) => {
    const key = String(id);
    if (aiPollingTimers.has(key)) return;

    const intervalMs = Number.isFinite(opts?.intervalMs) ? opts.intervalMs : 1500;
    const timeoutMs = Number.isFinite(opts?.timeoutMs) ? opts.timeoutMs : 180000;
    const startedAt = Date.now();
    let inFlight = false;

    // Ensure store indicates polling for this id
    set((state) => {
      const current = state.pollingPhotoIds || new Set();
      const filtered = Array.from(current).filter((value) => String(value) !== key);
      const next = new Set(filtered);
      next.add(id);
      return { pollingPhotoId: id, pollingPhotoIds: next };
    });

    const tick = async () => {
      if (inFlight) return;
      if (Date.now() - startedAt > timeoutMs) {
        get().stopAiPolling(id);
        return;
      }
      inFlight = true;
      try {
        const result = await getPhoto(id, { cacheBuster: Date.now() });
        const photo = result && result.photo ? result.photo : null;
        if (!photo) return;

        // Merge the latest photo data into the store so UI updates.
        try {
          get().updatePhoto(photo);
        } catch {
          // ignore update errors
        }

        if (isAiAnalysisComplete(photo)) {
          get().stopAiPolling(id);
        }
      } catch {
        // Network or auth errors: stop polling to avoid an infinite spinner
        get().stopAiPolling(id);
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(tick, intervalMs);
    aiPollingTimers.set(key, timer);
    // Kick off immediately
    tick();
  },

  stopAiPolling: (id) => {
    const key = String(id);
    const timer = aiPollingTimers.get(key);
    if (timer) {
      try { clearInterval(timer); } catch { /* ignore */ }
      aiPollingTimers.delete(key);
    }

    set((state) => {
      const current = state.pollingPhotoIds || new Set();
      const filtered = Array.from(current).filter((value) => String(value) !== key);
      const next = new Set(filtered);
      const shouldClearLegacy = state.pollingPhotoId != null && String(state.pollingPhotoId) === key;
      return {
        pollingPhotoIds: next,
        pollingPhotoId: shouldClearLegacy ? null : state.pollingPhotoId,
      };
    });
  },

  // Action: move a photo to inprogress and start polling for AI results
  moveToInprogress: async (id) => {
    try {
      await updatePhotoState(id, 'inprogress')
      // Update locally (keep photo visible) and set polling trigger
      set((state) => {
        const normalizeId = (value) => (value != null ? String(value) : value);
        const targetId = normalizeId(id);
        /** @type {Photo[]} */
        const currentPhotos = Array.isArray(state.photos) ? state.photos : [];

        const photos = currentPhotos.map((p) => {
          if (normalizeId(p?.id) !== targetId) return p;
          return { ...p, state: 'inprogress' };
        });

        return { photos };
      })

      // Poll until AI fields appear so "Analyzing..." clears when done.
      try {
        get().startAiPolling(id);
      } catch {
        // ignore polling start errors
      }
      return { success: true }
    } catch (err) {
  // ...toast error removed...
      return { success: false, error: err }
    }
  }
}))

export default useStore
