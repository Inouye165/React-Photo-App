import { useState, useRef, useEffect } from 'react';
import { LogOut, MessageSquareText, Settings, ChevronDown, Grid3X3, Edit3, Shield } from 'lucide-react';
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
  onOpenPhotos?: () => void;
  onOpenEdit?: () => void;
  onOpenAdmin?: () => void;
  theme?: 'light' | 'dark';
}

export default function UserMenu({ onOpenPhotos, onOpenEdit, onOpenAdmin, theme = 'light' }: UserMenuProps) {
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
  const isDark = theme === 'dark';

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

  const handlePhotos = () => {
    setIsOpen(false);
    onOpenPhotos?.();
  };

  const handleEdit = () => {
    setIsOpen(false);
    onOpenEdit?.();
  };

  const handleAdmin = () => {
    setIsOpen(false);
    onOpenAdmin?.();
  };

  if (!user) return null;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <div className="flex items-center gap-2">
          {isAdmin && onOpenAdmin ? (
            <button
              onClick={handleAdmin}
              data-testid="user-menu-admin-quick"
              aria-label="Open admin dashboard"
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-xs font-semibold sm:text-sm
                     ${isDark
                       ? 'border-indigo-300/60 bg-indigo-500/20 text-indigo-50 hover:bg-indigo-500/30'
                       : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                     }
                     transition-all touch-manipulation`}
            >
              <Shield size={16} />
              <span className="hidden sm:inline">Admin</span>
            </button>
          ) : null}

          <button
            onClick={() => setIsOpen(!isOpen)}
            data-testid="user-menu-trigger"
            aria-expanded={isOpen}
            aria-haspopup="true"
            aria-label="User menu"
            className={`flex items-center gap-2 min-h-[44px] px-2 sm:px-3
                     rounded-lg border text-xs sm:text-sm font-medium
                     ${isDark
                       ? 'border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-800 hover:border-slate-500'
                       : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                     }
                     active:bg-slate-100 transition-all touch-manipulation`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold overflow-hidden ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-600'}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="User avatar" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </div>

            <span className="hidden sm:block max-w-[88px] truncate">
              {displayName}
            </span>

            {isAdmin && (
              <span
                className={`hidden sm:inline px-2 py-0.5 text-[10px] font-semibold rounded-full ${isDark ? 'bg-purple-500/20 text-purple-200' : 'bg-purple-100 text-purple-700'}`}
                title="Administrator"
              >
                ADMIN
              </span>
            )}

            <ChevronDown
              size={14}
              className={`${isDark ? 'text-slate-300' : 'text-slate-400'} transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* Dropdown Menu */}
        {isOpen && (
          <div 
            className={`absolute right-0 top-full mt-1 w-[min(16rem,calc(100vw-1rem))] py-1
                       rounded-lg shadow-lg border
                       ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-200'}
                       z-50 animate-in fade-in slide-in-from-top-2 duration-150`}
            role="menu"
            aria-orientation="vertical"
          >
            {/* User info header */}
            <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <p className={`text-sm font-medium truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {displayName}
              </p>
              <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {user.email}
              </p>
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <button
                onClick={handlePhotos}
                data-testid="user-menu-gallery"
                role="menuitem"
                className={`w-full flex items-center gap-3 px-4 py-3
                           text-sm ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}
                           transition-colors touch-manipulation`}
              >
                <Grid3X3 size={18} className={isDark ? 'text-slate-400' : 'text-slate-400'} />
                Photos
              </button>

              <button
                onClick={handleEdit}
                data-testid="user-menu-edit"
                role="menuitem"
                className={`w-full flex items-center gap-3 px-4 py-3
                           text-sm ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}
                           transition-colors touch-manipulation`}
              >
                <Edit3 size={18} className="text-slate-400" />
                Edit
              </button>

              <button
                onClick={handleFeedback}
                data-testid="user-menu-feedback"
                role="menuitem"
                className={`w-full flex items-center gap-3 px-4 py-3
                           text-sm ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}
                           transition-colors touch-manipulation`}
              >
                <MessageSquareText size={18} className="text-slate-400" />
                Send Feedback
              </button>
              
              <button
                onClick={handleSettings}
                data-testid="user-menu-settings"
                role="menuitem"
                className={`w-full flex items-center gap-3 px-4 py-3
                           text-sm ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}
                           transition-colors touch-manipulation`}
              >
                <Settings size={18} className="text-slate-400" />
                Settings
              </button>

              {isAdmin && onOpenAdmin && (
                <button
                  onClick={handleAdmin}
                  data-testid="user-menu-admin"
                  role="menuitem"
                  className={`w-full flex items-center gap-3 px-4 py-3
                           text-sm ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}
                           transition-colors touch-manipulation`}
                >
                  <Shield size={18} className="text-slate-400" />
                  Admin Dashboard
                </button>
              )}
            </div>

            {/* About */}
            <div className={`border-t px-4 py-3 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>About</p>
              <div className={`mt-2 space-y-1 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Frontend</span>
                  <span className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-700'}>{FRONTEND_VERSION}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Frontend Time</span>
                  <span className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-700'}>{FRONTEND_BUILD_TIMESTAMP}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Backend</span>
                  <span className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-700'}>{aboutInfo?.backendVersion || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Backend Time</span>
                  <span className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-700'}>{aboutInfo?.backendTimestamp || '—'}</span>
                </div>
                {aboutInfo?.backendCommit && (
                  <div className="flex items-center justify-between gap-2">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Backend Commit</span>
                    <span className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-700'}>{aboutInfo.backendCommit}</span>
                  </div>
                )}
                {aboutError && (
                  <div className="text-[11px] text-amber-600">{aboutError}</div>
                )}
              </div>
            </div>

            {/* Logout */}
            <div className={`border-t py-1 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <button
                onClick={handleLogout}
                data-testid="user-menu-logout"
                role="menuitem"
                className={`w-full flex items-center gap-3 px-4 py-3
                           text-sm text-red-500 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}
                           transition-colors touch-manipulation`}
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
