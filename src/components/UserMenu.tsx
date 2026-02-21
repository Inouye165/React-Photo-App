import { useState, useRef, useEffect } from 'react';
import { LogOut, MessageSquareText, Settings, ChevronDown, Grid3X3, Edit3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import FeedbackModal from './FeedbackModal';
import UserSettingsModal from './UserSettingsModal';
import { API_BASE_URL } from '../api/httpClient';
import { FRONTEND_BUILD_TIMESTAMP, FRONTEND_VERSION } from '../version';

/**
 * UserMenu - Dropdown menu triggered by clicking the user avatar
 * 
 * Contains:
 * - Send Feedback (opens modal for app-wide feedback/suggestions)
 * - Settings (password change, preferences)
 * - Logout
 * 
 * Fat Finger Rule: All touch targets ≥ 44x44px
 */
interface UserMenuProps {
  onOpenGallery?: () => void;
  onOpenEdit?: () => void;
}

export default function UserMenu({ onOpenGallery, onOpenEdit }: UserMenuProps) {
  const { user, logout, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<{
    backendVersion: string | null;
    backendTimestamp: string | null;
    backendCommit: string | null;
  } | null>(null);
  const [aboutError, setAboutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Check if user has admin role
  const isAdmin = user?.app_metadata?.role === 'admin';
  const displayName = profile?.username || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const avatarUrl = profile?.avatar_url || null;

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (aboutInfo || aboutError) return;

    let cancelled = false;

    const loadAbout = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Health status ${response.status}`);
        }
        const data = (await response.json()) as {
          version?: string | null;
          timestamp?: string | null;
          commit?: string | null;
        };
        if (cancelled) return;
        setAboutInfo({
          backendVersion: typeof data.version === 'string' ? data.version : null,
          backendTimestamp: typeof data.timestamp === 'string' ? data.timestamp : null,
          backendCommit: typeof data.commit === 'string' ? data.commit : null,
        });
      } catch (err) {
        if (cancelled) return;
        setAboutError(err instanceof Error ? err.message : 'Unable to load backend version');
      }
    };

    void loadAbout();

    return () => {
      cancelled = true;
    };
  }, [aboutError, aboutInfo, isOpen]);

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  const handleFeedback = () => {
    setIsOpen(false);
    setShowFeedbackModal(true);
  };

  const handleSettings = () => {
    setIsOpen(false);
    setShowSettingsModal(true);
  };

  const handleGallery = () => {
    setIsOpen(false);
    onOpenGallery?.();
  };

  const handleEdit = () => {
    setIsOpen(false);
    onOpenEdit?.();
  };

  if (!user) return null;

  return (
    <>
      <div className="relative" ref={menuRef}>
        {/* Trigger Button - User Avatar */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          data-testid="user-menu-trigger"
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label="User menu"
          className="flex items-center gap-1.5 min-h-[44px] px-2 sm:px-3
                     rounded-lg border border-slate-200 bg-white
                     text-slate-600 text-xs sm:text-sm font-medium
                     hover:bg-slate-50 hover:border-slate-300
                     active:bg-slate-100 transition-all touch-manipulation"
        >
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center
                          text-xs font-semibold text-slate-600 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="User avatar" className="w-full h-full object-cover" />
            ) : (
              initial
            )}
          </div>
          
          {/* Username - hidden on mobile */}
          <span className="hidden md:block max-w-[80px] truncate">
            {displayName}
          </span>
          
          {/* Admin badge */}
          {isAdmin && (
            <span 
              className="hidden sm:inline px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-semibold rounded-full"
              title="Administrator"
            >
              ADMIN
            </span>
          )}
          
          {/* Chevron indicator */}
          <ChevronDown 
            size={14} 
            className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div 
            className="absolute right-0 top-full mt-1 w-56 py-1
                       bg-white rounded-lg shadow-lg border border-slate-200
                       z-50 animate-in fade-in slide-in-from-top-2 duration-150"
            role="menu"
            aria-orientation="vertical"
          >
            {/* User info header */}
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-900 truncate">
                {displayName}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user.email}
              </p>
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <button
                onClick={handleGallery}
                data-testid="user-menu-gallery"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-slate-700 hover:bg-slate-50
                           transition-colors touch-manipulation"
              >
                <Grid3X3 size={18} className="text-slate-400" />
                Gallery
              </button>

              <button
                onClick={handleEdit}
                data-testid="user-menu-edit"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-slate-700 hover:bg-slate-50
                           transition-colors touch-manipulation"
              >
                <Edit3 size={18} className="text-slate-400" />
                Edit
              </button>

              <button
                onClick={handleFeedback}
                data-testid="user-menu-feedback"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-slate-700 hover:bg-slate-50
                           transition-colors touch-manipulation"
              >
                <MessageSquareText size={18} className="text-slate-400" />
                Send Feedback
              </button>
              
              <button
                onClick={handleSettings}
                data-testid="user-menu-settings"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-slate-700 hover:bg-slate-50
                           transition-colors touch-manipulation"
              >
                <Settings size={18} className="text-slate-400" />
                Settings
              </button>
            </div>

            {/* About */}
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">About</p>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Frontend</span>
                  <span className="font-medium text-slate-700">{FRONTEND_VERSION}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Frontend Time</span>
                  <span className="font-medium text-slate-700">{FRONTEND_BUILD_TIMESTAMP}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Backend</span>
                  <span className="font-medium text-slate-700">{aboutInfo?.backendVersion || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Backend Time</span>
                  <span className="font-medium text-slate-700">{aboutInfo?.backendTimestamp || '—'}</span>
                </div>
                {aboutInfo?.backendCommit && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Backend Commit</span>
                    <span className="font-medium text-slate-700">{aboutInfo.backendCommit}</span>
                  </div>
                )}
                {aboutError && (
                  <div className="text-[11px] text-amber-600">{aboutError}</div>
                )}
              </div>
            </div>

            {/* Logout */}
            <div className="border-t border-slate-100 py-1">
              <button
                onClick={handleLogout}
                data-testid="user-menu-logout"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-red-600 hover:bg-red-50
                           transition-colors touch-manipulation"
              >
                <LogOut size={18} />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showFeedbackModal && (
        <FeedbackModal onClose={() => setShowFeedbackModal(false)} />
      )}
      
      {showSettingsModal && (
        <UserSettingsModal onClose={() => setShowSettingsModal(false)} />
      )}
    </>
  );
}
