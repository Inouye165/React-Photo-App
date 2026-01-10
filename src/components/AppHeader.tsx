import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import type { UserProfile } from '../api';
import useStore from '../store';
import { ChevronLeft, ChevronRight, Upload, Grid3X3, Edit3, MessageSquare, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import NewMessageNotification from './NewMessageNotification';
import UserMenu from './UserMenu';

/**
 * AppHeader - Mobile-first responsive navigation header
 * 
 * Features:
 * - Mobile (< 640px): Icons only, compact layout, visible logout
 * - Desktop: Full labels with icons
 * - Fat Finger Rule: All touch targets ≥ 44x44px
 * - PWA-ready fixed header with safe-area-inset support
 */

interface AppHeaderProps {
  rightContent?: React.ReactNode;
}

interface NavTabProps {
  isActive: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  testId: string;
}

interface NavTabLinkProps {
  to: string;
  icon: LucideIcon;
  label: string;
  testId: string;
  onClick?: () => void;
}

export default function AppHeader({ 
  rightContent,
}: AppHeaderProps): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const lastEditedPhotoId = useStore(state => state.lastEditedPhotoId);
  const closePicker = useStore(state => state.pickerCommand.closePicker);

  const canUseChat = Boolean((profile as UserProfile | null)?.has_set_username);
  const { unreadCount, unreadByRoom } = useUnreadMessages(user?.id);
  const [dismissedAtUnreadCount, setDismissedAtUnreadCount] = useState<number>(0);
  
  // Check if user has admin role
  const isAdmin = (user as User | null)?.app_metadata?.role === 'admin';

  const isGalleryPage = location.pathname === '/gallery' || location.pathname === '/';
  const isEditPage = /^\/photos\/[^/]+\/edit$/.test(location.pathname);
  const isUploadPage = location.pathname === '/upload';

  const currentPhotoId = ((): string | null => {
    const match = location.pathname.match(/^\/photos\/([^/]+)(?:\/edit)?$/);
    return match ? match[1] : null;
  })();

  const currentChatRoomId = ((): string | null => {
    const match = location.pathname.match(/^\/chat\/([^/?#]+)(?:[/?#].*)?$/);
    return match ? decodeURIComponent(match[1]) : null;
  })();

  const handleBack = (): void => {
    if (window.history.length > 1) {
      window.history.back();
    }
  };

  const handleForward = (): void => {
    window.history.forward();
  };

  const handleEditClick = (): void => {
    closePicker('nav-edit');
    if (currentPhotoId) {
      navigate(`/photos/${currentPhotoId}/edit`);
    } else if (lastEditedPhotoId) {
      navigate(`/photos/${lastEditedPhotoId}/edit`);
    } else {
      navigate('/gallery');
    }
  };

  // Tab button component for DRY code
  const NavTab = ({ isActive, onClick, icon: Icon, label, testId }: NavTabProps): React.ReactElement => (
    <button
      onClick={onClick}
      data-testid={testId}
      aria-current={isActive ? 'page' : undefined}
      className={`
        flex items-center justify-center gap-1.5
        min-w-[44px] min-h-[44px] px-2 sm:px-3
        rounded-lg text-xs sm:text-sm font-medium
        transition-all duration-150 touch-manipulation
        ${isActive 
          ? 'bg-slate-900 text-white' 
          : 'bg-transparent text-slate-500 hover:bg-slate-100 active:bg-slate-200'
        }
      `}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );

  const NavTabLink = ({ to, icon: Icon, label, testId, onClick }: NavTabLinkProps): React.ReactElement => (
    <NavLink
      to={to}
      onClick={onClick}
      data-testid={testId}
      className={({ isActive }) => `
        flex items-center justify-center gap-1.5
        min-w-[44px] min-h-[44px] px-2 sm:px-3
        rounded-lg text-xs sm:text-sm font-medium
        transition-all duration-150 touch-manipulation
        ${isActive
          ? 'bg-slate-900 text-white'
          : 'bg-transparent text-slate-500 hover:bg-slate-100 active:bg-slate-200'
        }
      `}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="hidden md:inline">{label}</span>
    </NavLink>
  );

  const unreadInCurrentRoom = currentChatRoomId ? (unreadByRoom?.[currentChatRoomId] ?? 0) : 0;
  const otherUnreadCount = Math.max(0, unreadCount - unreadInCurrentRoom);
  const shouldShowNotification = otherUnreadCount > dismissedAtUnreadCount;

  useEffect(() => {
    // If unread decreases (e.g., user reads messages), don't keep a stale high dismissal
    // threshold that would prevent future notifications from showing.
    if (otherUnreadCount < dismissedAtUnreadCount) {
      setDismissedAtUnreadCount(otherUnreadCount);
    }
  }, [otherUnreadCount, dismissedAtUnreadCount]);

  return (
    <>
      {shouldShowNotification && otherUnreadCount > 0 && (
        <NewMessageNotification 
          unreadCount={otherUnreadCount}
          onDismiss={() => setDismissedAtUnreadCount(otherUnreadCount)}
        />
      )}
      
      <header
        role="navigation"
        aria-label="Main toolbar"
        className="fixed top-0 left-0 right-0 z-50 h-14 
                   flex items-center justify-between px-2 sm:px-4
                   bg-white/95 backdrop-blur-md border-b border-slate-200
                   supports-[padding:env(safe-area-inset-top)]:pt-[env(safe-area-inset-top)]"
      >
      {/* Left Section - Logo & Nav Arrows */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink-0">
        {/* Logo - hidden on very small screens */}
        <span className="hidden xs:flex items-center gap-1 font-bold text-sm text-slate-900 whitespace-nowrap">
          📷 <span className="hidden md:inline">Lumina</span>
        </span>
        
        {/* Navigation Arrows */}
        <div className="flex items-center">
          <button
            onClick={handleBack}
            title="Go back"
            aria-label="Go back"
            data-testid="nav-back"
            className="flex items-center justify-center w-11 h-11 rounded-lg
                       text-slate-500 hover:bg-slate-100 active:bg-slate-200
                       transition-colors touch-manipulation"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={handleForward}
            title="Go forward"
            aria-label="Go forward"
            data-testid="nav-forward"
            className="flex items-center justify-center w-11 h-11 rounded-lg
                       text-slate-500 hover:bg-slate-100 active:bg-slate-200
                       transition-colors touch-manipulation"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Center Section - Navigation Tabs */}
      <nav className="flex-1 min-w-0 flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-1 
                      bg-slate-50 rounded-lg border border-slate-200 
                      overflow-x-auto scrollbar-hide">
        <NavTab
          isActive={isUploadPage}
          onClick={() => {
            closePicker('nav-upload');
            navigate('/upload');
          }}
          icon={Upload}
          label="Upload"
          testId="nav-upload"
        />
        <NavTab
          isActive={isGalleryPage}
          onClick={() => {
            closePicker('nav-gallery');
            navigate('/gallery');
          }}
          icon={Grid3X3}
          label="Gallery"
          testId="nav-gallery"
        />
        <NavTab
          isActive={isEditPage}
          onClick={handleEditClick}
          icon={Edit3}
          label="Edit"
          testId="nav-edit"
        />

        {canUseChat && (
          <div className="relative">
            <NavTabLink
              to="/chat"
              onClick={() => {
                closePicker('nav-messages');
              }}
              icon={MessageSquare}
              label="Messages"
              testId="nav-messages"
            />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center animate-pulse" data-testid="unread-badge">
                <span className="text-white text-[10px] font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </div>
            )}
          </div>
        )}
        
        {/* Admin link - only visible to admin users */}
        {isAdmin && (
          <NavTabLink
            to="/admin"
            onClick={() => {
              closePicker('nav-admin');
            }}
            icon={Shield}
            label="Admin"
            testId="nav-admin"
          />
        )}
      </nav>

      {/* Right Section - User Menu */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink-0">
        {rightContent}
        
        {user && <UserMenu />}
      </div>
    </header>
    </>
  );
}
