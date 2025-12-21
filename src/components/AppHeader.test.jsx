import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({
    pathname: '/gallery',
    search: '',
  }),
  NavLink: ({ to, className, children, ...rest }) => {
    const computedClassName = typeof className === 'function' ? className({ isActive: false }) : className;
    return (
      <a href={to} className={computedClassName} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@example.com' },
    logout: vi.fn(),
  }),
}));

vi.mock('../store', () => ({
  default: vi.fn((selector) => {
    const state = {
      lastEditedPhotoId: null,
      pickerCommand: {
        closePicker: vi.fn(),
      },
    };
    return typeof selector === 'function' ? selector(state) : state;
  }),
}));

describe('AppHeader Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders navigation tabs with icons', () => {
    render(<AppHeader />);
    
    // Check all navigation tabs exist
    expect(screen.getByTestId('nav-upload')).toBeInTheDocument();
    expect(screen.getByTestId('nav-gallery')).toBeInTheDocument();
    expect(screen.getByTestId('nav-edit')).toBeInTheDocument();
    expect(screen.getByTestId('nav-messages')).toBeInTheDocument();
  });

  it('renders navigation arrows with accessible labels', () => {
    render(<AppHeader />);
    
    const backButton = screen.getByTestId('nav-back');
    const forwardButton = screen.getByTestId('nav-forward');
    
    expect(backButton).toBeInTheDocument();
    expect(forwardButton).toBeInTheDocument();
    expect(backButton).toHaveAttribute('aria-label', 'Go back');
    expect(forwardButton).toHaveAttribute('aria-label', 'Go forward');
  });

  it('renders logout button with accessible label', () => {
    render(<AppHeader />);
    
    const logoutButton = screen.getByTestId('logout-button');
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton).toHaveAttribute('aria-label', 'Sign out');
  });

  describe('Touch Target Accessibility (Fat Finger Rule)', () => {
    it('navigation buttons have minimum 44px touch target', () => {
      render(<AppHeader />);
      
      const navButtons = [
        screen.getByTestId('nav-upload'),
        screen.getByTestId('nav-gallery'),
        screen.getByTestId('nav-edit'),
        screen.getByTestId('nav-messages'),
      ];
      
      navButtons.forEach((button) => {
        // Buttons should have min-w-[44px] min-h-[44px] classes
        expect(button.className).toMatch(/min-w-\[44px\]/);
        expect(button.className).toMatch(/min-h-\[44px\]/);
      });
    });

    it('back/forward buttons have minimum 44px touch target', () => {
      render(<AppHeader />);
      
      const backButton = screen.getByTestId('nav-back');
      const forwardButton = screen.getByTestId('nav-forward');
      
      // These use w-11 h-11 which equals 44px
      expect(backButton.className).toMatch(/w-11/);
      expect(backButton.className).toMatch(/h-11/);
      expect(forwardButton.className).toMatch(/w-11/);
      expect(forwardButton.className).toMatch(/h-11/);
    });

    it('logout button has minimum 44px touch target', () => {
      render(<AppHeader />);
      
      const logoutButton = screen.getByTestId('logout-button');
      expect(logoutButton.className).toMatch(/min-w-\[44px\]/);
      expect(logoutButton.className).toMatch(/min-h-\[44px\]/);
    });
  });

  describe('Responsive Behavior', () => {
    it('has hidden text labels on mobile (sm:inline class)', () => {
      render(<AppHeader />);
      
      // Check that labels use responsive classes
      const uploadButton = screen.getByTestId('nav-upload');
      const labelSpan = uploadButton.querySelector('span');
      
      // Labels should have hidden sm:inline classes
      expect(labelSpan?.className).toMatch(/hidden\s+sm:inline/);
    });

    it('logout button text hidden on mobile', () => {
      render(<AppHeader />);
      
      const logoutButton = screen.getByTestId('logout-button');
      const labelSpan = logoutButton.querySelector('span');
      
      expect(labelSpan?.className).toMatch(/hidden\s+sm:inline/);
    });
  });

  describe('Navigation Functionality', () => {
    it('calls history.back when back button is clicked', async () => {
      const mockBack = vi.fn();
      const originalHistory = window.history;
      
      // Mock window.history
      Object.defineProperty(window, 'history', {
        value: {
          length: 2,
          back: mockBack,
          forward: vi.fn(),
        },
        writable: true,
      });
      
      render(<AppHeader />);
      
      await userEvent.click(screen.getByTestId('nav-back'));
      expect(mockBack).toHaveBeenCalled();
      
      // Restore
      Object.defineProperty(window, 'history', { value: originalHistory, writable: true });
    });

    it('calls history.forward when forward button is clicked', async () => {
      const mockForward = vi.fn();
      const originalHistory = window.history;
      
      Object.defineProperty(window, 'history', {
        value: {
          length: 2,
          back: vi.fn(),
          forward: mockForward,
        },
        writable: true,
      });
      
      render(<AppHeader />);
      
      await userEvent.click(screen.getByTestId('nav-forward'));
      expect(mockForward).toHaveBeenCalled();
      
      Object.defineProperty(window, 'history', { value: originalHistory, writable: true });
    });
  });

  describe('Active State Indicators', () => {
    it('marks current view as active with aria-current', () => {
      render(<AppHeader />);
      
      // Based on mock location (/gallery), Gallery should be active
      const galleryButton = screen.getByTestId('nav-gallery');
      expect(galleryButton).toHaveAttribute('aria-current', 'page');
    });

    it('inactive tabs do not have aria-current', () => {
      render(<AppHeader />);
      
      const uploadButton = screen.getByTestId('nav-upload');
      expect(uploadButton).not.toHaveAttribute('aria-current');
    });
  });

  describe('Header Accessibility', () => {
    it('has proper navigation role and label', () => {
      render(<AppHeader />);
      
      // Use more specific query since there are multiple navigation elements
      const header = screen.getByRole('navigation', { name: 'Main toolbar' });
      expect(header).toBeInTheDocument();
      expect(header.tagName).toBe('HEADER');
    });
  });
});
