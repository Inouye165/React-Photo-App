import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import MockAuthProvider, { type MockAuthValues } from './MockAuthProvider'

type RenderWithAuthOptions = {
  mockAuthValues?: MockAuthValues
} & Omit<RenderOptions, 'wrapper'>

// Helper function to render components with AuthProvider
export const renderWithAuth = (
  ui: ReactElement,
  { mockAuthValues = {}, ...renderOptions }: RenderWithAuthOptions = {},
) => {
  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <MockAuthProvider mockAuthValues={mockAuthValues}>{children}</MockAuthProvider>
  )

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// Helper to render with authenticated user
export const renderWithAuthenticatedUser = (ui: ReactElement, userOptions: Record<string, unknown> = {}) => {
  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    ...userOptions,
  }

  return renderWithAuth(ui, {
    mockAuthValues: {
      user: mockUser,
      token: 'mock-token',
      isAuthenticated: true,
    },
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
  findByTestId,
} from '@testing-library/react'
