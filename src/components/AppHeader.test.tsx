// @ts-nocheck
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader';

vi.mock('../api/games', () => ({
  listMyGames: vi.fn(async () => ([])),
  listMyGamesWithMembers: vi.fn(async () => ([])),
}));

const mockRouterState = vi.hoisted(() => ({
  location: {
    pathname: '/gallery',
    search: '',
  },
}));

const mockUnreadState = vi.hoisted(() => ({
  unread: {
    unreadCount: 0,
    unreadByRoom: {},
    hasUnread: false,
    loading: false,
    markAllAsRead: vi.fn(),
  },
}));

const navigateMock = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => mockRouterState.location,
  NavLink: ({ to, className, children, ...rest }) => {
    const pathname = mockRouterState.location.pathname || '';
    const target = String(to || '');
    const isActive = pathname === target || pathname.startsWith(`${target}/`);
    const computedClassName = typeof className === 'function' ? className({ isActive }) : className;
    return (
      <a href={to} className={computedClassName} aria-current={isActive ? 'page' : undefined} {...rest}>
        {children}
      </a>
    );
  },
}));

const authState = {
  user: { email: 'test@example.com' },
  logout: vi.fn(),
  profile: { username: 'tester', has_set_username: true },
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
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

vi.mock('../hooks/useUnreadMessages', () => ({
  useUnreadMessages: vi.fn(() => ({
    ...mockUnreadState.unread,
  })),
}));

vi.mock('./NewMessageNotification', () => ({
  default: ({ unreadCount }) => (
    <div data-testid="new-message-notification">Unread: {unreadCount}</div>
  ),
}));

describe('AppHeader Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    authState.user = { email: 'test@example.com' };
    authState.profile = { username: 'tester', has_set_username: true };

    mockRouterState.location.pathname = '/gallery';
    mockRouterState.location.search = '';
    mockUnreadState.unread = {
      unreadCount: 0,
      unreadByRoom: {},
      hasUnread: false,
      loading: false,
      markAllAsRead: vi.fn(),
    };
  });

  it('renders new message popup on /chat (no room) when unread exists', () => {
    mockRouterState.location.pathname = '/chat';
    mockUnreadState.unread = {
      ...mockUnreadState.unread,
      unreadCount: 3,
      unreadByRoom: { roomA: 1, roomB: 2 },
      hasUnread: true,
    };

    render(<AppHeader />);
    expect(screen.getByTestId('new-message-notification')).toBeInTheDocument();
  });

  it('renders new message popup on /chat/room-A when unread exists for another room', () => {
    mockRouterState.location.pathname = '/chat/room-A';
    mockUnreadState.unread = {
      ...mockUnreadState.unread,
      unreadCount: 1,
      unreadByRoom: { 'room-B': 1 },
      hasUnread: true,
    };

    render(<AppHeader />);
    expect(screen.getByTestId('new-message-notification')).toBeInTheDocument();
  });

  it('suppresses new message popup on /chat/room-A when unread exists only for room-A', () => {
    mockRouterState.location.pathname = '/chat/room-A';
    mockUnreadState.unread = {
      ...mockUnreadState.unread,
      unreadCount: 2,
      unreadByRoom: { 'room-A': 2 },
      hasUnread: true,
    };

    render(<AppHeader />);
    expect(screen.queryByTestId('new-message-notification')).not.toBeInTheDocument();
  });

  it('renders new message popup off /chat when hasUnread=true', () => {
    mockRouterState.location.pathname = '/gallery';
    mockUnreadState.unread = {
      ...mockUnreadState.unread,
      unreadCount: 3,
      unreadByRoom: { roomA: 3 },
      hasUnread: true,
    };

    render(<AppHeader />);
    expect(screen.getByTestId('new-message-notification')).toBeInTheDocument();
  });

  it('renders navigation tabs with icons', () => {
    render(<AppHeader />);
    
    // Primary nav keeps Messages + Games visible
    expect(screen.getByTestId('nav-messages')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Games' })).toBeInTheDocument();

    // Gallery/Edit are now in account dropdown, not primary nav
    expect(screen.queryByTestId('nav-gallery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-upload')).not.toBeInTheDocument();
  });

  it('opens Games menu and navigates to chess app shell', async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    await user.click(screen.getByRole('button', { name: 'Games' }));

    expect(screen.getByRole('menu', { name: 'Games menu' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Chess Open Chess app shell' })).toBeInTheDocument();

    const disabledEntry = screen.getByRole('menuitem', { name: 'More games coming soon New game modes are in progress.' });
    expect(disabledEntry).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('menuitem', { name: 'Chess Open Chess app shell' }));
    expect(navigateMock).toHaveBeenCalledWith('/games/chess');
  });

  it('hides Messages tab when username is not set', () => {
    authState.profile = { username: null, has_set_username: false };
    render(<AppHeader />);
    expect(screen.queryByTestId('nav-messages')).not.toBeInTheDocument();
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

  it('renders user menu trigger with accessible label', () => {
    render(<AppHeader />);
    
    const userMenuTrigger = screen.getByTestId('user-menu-trigger');
    expect(userMenuTrigger).toBeInTheDocument();
    expect(userMenuTrigger).toHaveAttribute('aria-label', 'User menu');
    expect(userMenuTrigger).toHaveAttribute('aria-haspopup', 'true');
  });

  describe('Touch Target Accessibility (Fat Finger Rule)', () => {
    it('navigation buttons have minimum 44px touch target', () => {
      render(<AppHeader />);
      
      const navButtons = [
        screen.getByTestId('nav-messages'),
        screen.getByTestId('nav-games'),
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

    it('user menu trigger has minimum 44px touch target', () => {
      render(<AppHeader />);
      
      const userMenuTrigger = screen.getByTestId('user-menu-trigger');
      expect(userMenuTrigger.className).toMatch(/min-h-\[44px\]/);
    });
  });

  describe('Responsive Behavior', () => {
    it('has hidden text labels on mobile (md:inline class)', () => {
      render(<AppHeader />);
      
      // Check that labels use responsive classes
      const messagesButton = screen.getByTestId('nav-messages');
      const labelSpan = messagesButton.querySelector('span');
      
      // Labels should have hidden md:inline classes
      expect(labelSpan?.className).toMatch(/hidden\s+md:inline/);
    });

    it('user menu shows username hidden on mobile', () => {
      render(<AppHeader />);
      
      const userMenuTrigger = screen.getByTestId('user-menu-trigger');
      const usernameSpan = userMenuTrigger.querySelector('span.hidden');
      
      // Username span should be hidden on mobile (md:block)
      expect(usernameSpan?.className).toMatch(/hidden/);
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
    it('marks messages view as active with aria-current', () => {
      mockRouterState.location.pathname = '/chat';
      render(<AppHeader />);
      
      const messagesButton = screen.getByTestId('nav-messages');
      expect(messagesButton).toHaveAttribute('aria-current', 'page');
    });

    it('messages is inactive outside chat routes', () => {
      mockRouterState.location.pathname = '/gallery';
      render(<AppHeader />);
      
      const messagesButton = screen.getByTestId('nav-messages');
      expect(messagesButton).not.toHaveAttribute('aria-current');
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
