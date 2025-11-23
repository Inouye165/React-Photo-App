import React from 'react'
import { vi } from 'vitest'

// Create a mock AuthContext
const AuthContext = React.createContext()

// Mock AuthProvider for testing
// NOTE: Updated to match strict AuthProvider behavior
// By default, loading is FALSE (tests assume auth is already initialized)
// Set mockAuthValues.loading = true to test loading states
const MockAuthProvider = ({ children, mockAuthValues = {} }) => {
  const defaultValues = {
    user: null,
    session: null,
    token: null,
    loading: false, // Default to initialized state for tests
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    signInWithPhone: vi.fn(),
    verifyPhoneOtp: vi.fn(),
    resetPassword: vi.fn(),
    isAuthenticated: false,
    ...mockAuthValues
  }

  // Match AuthProvider behavior: if loading, don't render children
  if (defaultValues.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Initializing...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={defaultValues}>
      {children}
    </AuthContext.Provider>
  )
}

export default MockAuthProvider