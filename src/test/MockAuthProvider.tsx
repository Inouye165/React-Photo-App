import React, { type ReactNode } from 'react'
import { vi } from 'vitest'

export type MockAuthValues = {
  user?: unknown
  session?: unknown
  token?: string | null
  loading?: boolean
  login?: (...args: unknown[]) => unknown
  register?: (...args: unknown[]) => unknown
  logout?: (...args: unknown[]) => unknown
  signInWithPhone?: (...args: unknown[]) => unknown
  verifyPhoneOtp?: (...args: unknown[]) => unknown
  resetPassword?: (...args: unknown[]) => unknown
  isAuthenticated?: boolean
  [key: string]: unknown
}

type MockAuthProviderProps = {
  children?: ReactNode
  mockAuthValues?: MockAuthValues
}

// Create a mock AuthContext
const AuthContext = React.createContext<MockAuthValues | undefined>(undefined)

// Mock AuthProvider for testing
// NOTE: Updated to match strict AuthProvider behavior
// By default, loading is FALSE (tests assume auth is already initialized)
// Set mockAuthValues.loading = true to test loading states
const MockAuthProvider = ({ children, mockAuthValues = {} }: MockAuthProviderProps) => {
  const defaultValues: MockAuthValues = {
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
    ...mockAuthValues,
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

  return <AuthContext.Provider value={defaultValues}>{children}</AuthContext.Provider>
}

export default MockAuthProvider
