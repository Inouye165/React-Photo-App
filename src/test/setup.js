import '@testing-library/jest-dom/vitest'
import { vi, afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import React from 'react'
import { uploadPickerInitialState } from '../store/uploadPickerSlice'

/**
 * CRITICAL: Mock heavy WASM dependencies to prevent memory issues during testing.
 * These must be mocked before they're imported by any test or module.
 */
vi.mock('heic2any', () => ({
  default: vi.fn(() => Promise.resolve(new Blob(['converted'], { type: 'image/jpeg' }))),
}));

vi.mock('heic-to', () => ({
  heicTo: vi.fn(() => Promise.resolve(new Blob(['converted'], { type: 'image/jpeg' }))),
}));

vi.mock('idb-keyval', () => ({
  get: vi.fn(() => Promise.resolve(null)),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
  createStore: vi.fn(() => ({})),
}));

/**
 * Mock Web Worker for heic2any and other browser-only APIs.
 * 
 * heic2any uses Web Workers internally, which are not available in Node.js/jsdom.
 * This minimal mock prevents "ReferenceError: Worker is not defined" errors
 * during test runs while allowing tests to execute without actual Worker functionality.
 * 
 * The mock provides the basic Worker interface (postMessage, terminate, event listeners)
 * but does not execute any actual worker code.
 */
class MockWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
  }
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
}
globalThis.Worker = MockWorker;

// Mock API responses for consistent testing
const mockApiResponses = {
  '/api/users/me/preferences': {
    success: true,
    data: {
      gradingScales: {},
    },
  },
  '/api/users/me': {
    success: true,
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'testuser',
      has_set_username: true,
    },
  },
  '/api/photos': {
    success: true,
    photos: [
      {
        id: 1,
        filename: 'test1.jpg',
        state: 'working',
        hash: 'abc123',
        file_size: 1024000,
        metadata: { DateTimeOriginal: '2024-01-01 12:00:00' },
        thumbnail: '/display/thumbnails/abc123.jpg'
      },
      {
        id: 2,
        filename: 'test2.jpg',
        state: 'inprogress',
        hash: 'def456',
        file_size: 2048000,
        metadata: { DateTimeOriginal: '2024-01-02 12:00:00' },
        thumbnail: '/display/thumbnails/def456.jpg'
      }
    ]
  },
  '/api/auth/login': {
    success: true,
    token: 'mock-jwt-token',
    user: { id: 1, username: 'testuser' }
  },
  '/api/auth/register': {
    success: true,
    token: 'mock-jwt-token',
    user: { id: 1, username: 'testuser' }
  },
  '/api/uploads/upload': {
    success: true,
    filename: 'uploaded.jpg',
    hash: 'upload123'
  },
  '/api/privilege/batch': {
    'test1.jpg': 'RWX',
    'test2.jpg': 'RWX'
  }
};

// Mock AuthContext before other imports
vi.mock('../contexts/AuthContext', () => {
  const mockAuthContext = {
    user: { id: 1, username: 'testuser' },
    token: 'mock-jwt-token',
    loading: false,
    login: vi.fn().mockResolvedValue({ success: true }),
    register: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn(),
    isAuthenticated: true,
  }

  return {
    useAuth: () => mockAuthContext,
    AuthProvider: ({ children }) => children,
  }
})

vi.mock('react-konva', () => ({
  Stage: ({ children, ...props }) => React.createElement('div', { 'data-testid': 'konva-stage', ...props }, children),
  Layer: ({ children, ...props }) => React.createElement('div', { 'data-testid': 'konva-layer', ...props }, children),
  Image: ({ ...props }) => React.createElement('img', { 'data-testid': 'konva-image', ...props }),
  Text: ({ text, ...props }) => React.createElement('div', { 'data-testid': 'konva-text', ...props }, text),
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn((key) => {
    if (key === 'token') return 'mock-jwt-token';
    if (key === 'user') return JSON.stringify({ id: 1, username: 'testuser' });
    return null;
  }),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock window.showDirectoryPicker for File System Access API tests
global.showDirectoryPicker = vi.fn()

// Enhanced fetch mock that returns appropriate responses
const defaultFetchImpl = (url, options = {}) => {
  const _method = options.method || 'GET';
  
  // Handle different API endpoints
  for (const [endpoint, response] of Object.entries(mockApiResponses)) {
    if (url.includes(endpoint)) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => response,
        text: async () => JSON.stringify(response),
        blob: async () => new Blob([JSON.stringify(response)]),
      });
    }
  }
  
  // Handle privilege check batch requests specifically
  if (url.includes('/api/privilege/batch') || url.includes('privilege')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockApiResponses['/api/privilege/batch'],
      text: async () => JSON.stringify(mockApiResponses['/api/privilege/batch']),
    });
  }
  
  // Handle image requests (thumbnails, displays)
  if (url.includes('/display/') || url.includes('/thumbnails/')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      blob: async () => new Blob(['fake-image-data'], { type: 'image/jpeg' }),
      arrayBuffer: async () => new ArrayBuffer(1024),
    });
  }
  
  // Default response for unhandled requests
  return Promise.resolve({
    ok: false,
    status: 404,
    headers: new Headers(),
    json: async () => ({ error: 'Not found' }),
    text: async () => 'Not found',
  });
};

global.fetch = vi.fn().mockImplementation(defaultFetchImpl);

// Mock window.open for external links
global.open = vi.fn()

// Mock ResizeObserver which might be used by components
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock HTMLCanvasElement.getContext for image processing
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn(),
  canvas: { width: 100, height: 100 },
}))

// Mock Image constructor for image loading tests
global.Image = class {
  constructor() {
    setTimeout(() => {
      this.onload && this.onload();
    }, 0);
  }
  
  set src(value) {
    this._src = value;
  }
  
  get src() {
    return this._src;
  }
}

// Mock Supabase client
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => {
      const makeThenable = (result) => {
        const builder = {
          select: () => builder,
          in: () => makeThenable({ data: [], error: null }),
          eq: () => builder,
          neq: () => builder,
          limit: () => builder,
          maybeSingle: () => makeThenable({ data: null, error: null }),
          update: () => {
            const updateBuilder = {
              eq: () => updateBuilder,
              then: (onFulfilled, onRejected) => Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected),
            }
            return updateBuilder
          },
          then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
        }
        return builder
      }

      return makeThenable({ data: [], error: null })
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock-token' } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: '1', email: 'test@example.com' } }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: '1', email: 'test@example.com' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    }
    ,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null }))
  }
}))

// CRITICAL FIX: Create a factory function that returns fresh state for each test
const createDefaultState = () => ({
  photos: [],
  toast: { message: '', severity: 'info' },
  banner: { message: '', severity: 'info' },
  view: 'working',
  activePhotoId: null,
  editingMode: null,
  showMetadataModal: false,
  metadataPhoto: null,
  uploadPicker: { ...uploadPickerInitialState },
  toolbarMessage: '',
  toolbarSeverity: 'info',
  pollingPhotoId: null,
  pollingPhotoIds: new Set(),
  justUploadedPhotoIds: new Set(),
  pendingUploads: [],
  backgroundUploads: [],
  setPhotos: vi.fn(),
  setBanner: vi.fn(),
  setToast: vi.fn(),
  setView: vi.fn(),
  setActivePhotoId: vi.fn(),
  setEditingMode: vi.fn(),
  setShowMetadataModal: vi.fn(),
  setMetadataPhoto: vi.fn(),
  setToolbarMessage: vi.fn(),
  setToolbarSeverity: vi.fn(),
  setPollingPhotoId: vi.fn(),
  addPollingId: vi.fn(),
  removePollingId: vi.fn(),
  startAiPolling: vi.fn(),
  stopAiPolling: vi.fn(),
  updatePhotoData: vi.fn(),
  updatePhoto: vi.fn(),
  removePhotoById: vi.fn(),
  moveToInprogress: vi.fn(),
  markPhotoAsJustUploaded: vi.fn(),
  removeJustUploadedMark: vi.fn(),
  isPhotoJustUploaded: vi.fn(),
  addPendingUploads: vi.fn(),
  removePendingUpload: vi.fn(),
  clearPendingUploads: vi.fn(),
  pickerCommand: {
    openPicker: vi.fn(),
    closePicker: vi.fn(),
    resetPicker: vi.fn(),
    setFilters: vi.fn(),
    queuePhotos: vi.fn(),
    startUpload: vi.fn(),
    markUploadSuccess: vi.fn(),
    markUploadFailure: vi.fn(),
    finishUploads: vi.fn(),
  },
})

// Mock Zustand store with fresh state for each test
vi.mock('../store', () => {
  return {
    default: vi.fn((selector) => {
      const defaultState = createDefaultState()
      
      if (typeof selector === 'function') {
        return selector(defaultState)
      }
      return defaultState
    })
  }
})

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockImplementation((key) => {
    if (key === 'token') return 'mock-jwt-token';
    if (key === 'user') return JSON.stringify({ id: 1, username: 'testuser' });
    return null;
  });
});

// CRITICAL FIX: Aggressive cleanup after each test
afterEach(() => {
  cleanup();
  
  // Clear all timers
  vi.clearAllTimers();
  
  // Force garbage collection if available (won't work in all envs, but helps when it does)
  if (global.gc) {
    global.gc();
  }
  
  // Clear fetch mock history (if it is still a mock)
  if (global.fetch && typeof global.fetch.mockClear === 'function') {
    global.fetch.mockClear();
  }

  // IMPORTANT: Some tests overwrite global.fetch. Restore our default implementation
  // so later tests don't observe an unconfigured fetch returning undefined.
  global.fetch = vi.fn().mockImplementation(defaultFetchImpl);
})