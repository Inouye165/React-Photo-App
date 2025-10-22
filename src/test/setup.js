import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import React from 'react'

// Mock AuthContext before other imports
vi.mock('../contexts/AuthContext', () => {
  const mockAuthContext = {
    user: null,
    token: null,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: false,
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
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock window.showDirectoryPicker for File System Access API tests
global.showDirectoryPicker = vi.fn()

// Mock fetch for API calls
global.fetch = vi.fn()

// Mock window.open for external links
global.open = vi.fn()

// Mock ResizeObserver which might be used by components
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock HTMLCanvasElement.getContext for image processing
HTMLCanvasElement.prototype.getContext = vi.fn()

// Cleanup after each test case
afterEach(cleanup)