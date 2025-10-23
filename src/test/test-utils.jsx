import React from 'react'
import { render } from '@testing-library/react'
import MockAuthProvider from './MockAuthProvider.jsx'

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

// Re-export specific utilities from @testing-library/react
export { 
  screen, 
  fireEvent, 
  waitFor, 
  act,
  cleanup,
  within,
  getByRole,
  getByText,
  getByTestId,
  queryByRole,
  queryByText,
  queryByTestId,
  findByRole,
  findByText,
  findByTestId
} from '@testing-library/react'