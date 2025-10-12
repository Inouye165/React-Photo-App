import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

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