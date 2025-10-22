import React from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'

// Create a mock AuthContext
const AuthContext = React.createContext()

// Mock AuthProvider for testing
const MockAuthProvider = ({ children, mockAuthValues = {} }) => {
  const defaultValues = {
    user: null,
    token: null,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: false,
    ...mockAuthValues
  }

  return (
    <AuthContext.Provider value={defaultValues}>
      {children}
    </AuthContext.Provider>
  )
}

// Helper function to render components with AuthProvider
export const renderWithAuth = (ui, { mockAuthValues = {}, ...renderOptions } = {}) => {
  const Wrapper = ({ children }) => (
    <MockAuthProvider mockAuthValues={mockAuthValues}>
      {children}
    </MockAuthProvider>
  )

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// Helper to render with authenticated user
export const renderWithAuthenticatedUser = (ui, userOptions = {}) => {
  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    ...userOptions
  }

  return renderWithAuth(ui, {
    mockAuthValues: {
      user: mockUser,
      token: 'mock-token',
      isAuthenticated: true
    }
  })
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react'