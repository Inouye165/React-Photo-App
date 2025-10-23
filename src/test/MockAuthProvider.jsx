import React from 'react'
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

export default MockAuthProvider