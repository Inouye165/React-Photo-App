import { useState, useRef, useEffect } from 'react';
import { LogOut, MessageSquareText, Settings, ChevronDown, Grid3X3, Edit3, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import FeedbackModal from './FeedbackModal';
import UserSettingsModal from './UserSettingsModal';
import { API_BASE_URL } from '../api/httpClient';
import { FRONTEND_BUILD_TIMESTAMP, FRONTEND_VERSION } from '../version';

/**
 * ChessUserMenu - Chess-themed dropdown menu triggered by clicking the user avatar
 * 
 * Contains:
 * - Send Feedback (opens modal for app-wide feedback/suggestions)
 * - Settings (password change, preferences)
 * - Logout
 * 
 * Fat Finger Rule: All touch targets ≥ 44x44px
 */
interface ChessUserMenuProps {
  onOpenPhotos?: () => void;
  onOpenEdit?: () => void;
  onOpenAdmin?: () => void;
  showAdminQuickAction?: boolean;
}

export default function ChessUserMenu({
  onOpenPhotos,
  onOpenEdit,
  onOpenAdmin,
  showAdminQuickAction = false,
}: ChessUserMenuProps) {
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
          {isAdmin && onOpenAdmin && showAdminQuickAction ? (
            <button
              onClick={handleAdmin}
              data-testid="user-menu-admin-quick"
              aria-label="Open admin dashboard"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-xs font-semibold sm:text-sm
                     border-chess-accent/30 bg-chess-accent/10 text-chess-accentSoft hover:bg-chess-accent/20
                     transition-all touch-manipulation"
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
            className="flex items-center gap-2 min-h-[44px] px-2 sm:px-3
                     rounded-lg border text-xs sm:text-sm font-medium
                     border-white/12 bg-chess-surface hover:bg-chess-surfaceSoft hover:border-white/20
                     active:bg-chess-surface transition-all touch-manipulation"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold overflow-hidden bg-chess-surfaceSoft text-chess-accentSoft ring-1 ring-white/15">
              {avatarUrl ? (
                <img src={avatarUrl} alt="User avatar" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </div>

            <span className="hidden sm:block max-w-[88px] truncate text-chess-text">
              {displayName}
            </span>

            {isAdmin && (
              <span
                className="hidden sm:inline px-2 py-0.5 text-[10px] font-semibold rounded-full bg-chess-accent/20 text-chess-accentSoft"
                title="Administrator"
              >
                ADMIN
              </span>
            )}

            <ChevronDown
              size={14}
              className={"text-chess-muted transition-transform " + (isOpen ? 'rotate-180' : '')}
            />
          </button>
        </div>

        {/* Dropdown Menu */}
        {isOpen && (
          <div 
            className="absolute right-0 top-full mt-1 w-[min(16rem,calc(100vw-1rem))] py-1
                       rounded-lg shadow-chess-card border border-white/12
                       bg-chess-surface
                       z-50 animate-in fade-in slide-in-from-top-2 duration-150"
            role="menu"
            aria-orientation="vertical"
          >
            {/* User info header */}
            <div className="px-4 py-3 border-b border-white/12">
              <p className="text-sm font-medium truncate text-chess-text">
                {displayName}
              </p>
              <p className="text-xs truncate text-chess-muted">
                {user.email}
              </p>
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <button
                onClick={handlePhotos}
                data-testid="user-menu-gallery"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-chess-text hover:bg-chess-surfaceSoft
                           transition-colors touch-manipulation"
              >
                <Grid3X3 size={18} className="text-chess-muted" />
                Photos
              </button>

              <button
                onClick={handleEdit}
                data-testid="user-menu-edit"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-chess-text hover:bg-chess-surfaceSoft
                           transition-colors touch-manipulation"
              >
                <Edit3 size={18} className="text-chess-muted" />
                Edit
              </button>

              <button
                onClick={handleFeedback}
                data-testid="user-menu-feedback"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-chess-text hover:bg-chess-surfaceSoft
                           transition-colors touch-manipulation"
              >
                <MessageSquareText size={18} className="text-chess-muted" />
                Send Feedback
              </button>
              
              <button
                onClick={handleSettings}
                data-testid="user-menu-settings"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-chess-text hover:bg-chess-surfaceSoft
                           transition-colors touch-manipulation"
              >
                <Settings size={18} className="text-chess-muted" />
                Settings
              </button>

              {isAdmin && onOpenAdmin && (
                <button
                  onClick={handleAdmin}
                  data-testid="user-menu-admin"
                  role="menuitem"
                  className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-chess-text hover:bg-chess-surfaceSoft
                           transition-colors touch-manipulation"
                >
                  <Shield size={18} className="text-chess-muted" />
                  Admin Dashboard
                </button>
              )}
            </div>

            {/* About */}
            <div className="border-t border-white/12 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-chess-muted">About</p>
              <div className="mt-2 space-y-1 text-xs text-chess-text">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-chess-muted">Frontend</span>
                  <span className="font-medium text-chess-text">{FRONTEND_VERSION}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-chess-muted">Frontend Time</span>
                  <span className="font-medium text-chess-text">{FRONTEND_BUILD_TIMESTAMP}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-chess-muted">Backend</span>
                  <span className="font-medium text-chess-text">{aboutInfo?.backendVersion || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-chess-muted">Backend Time</span>
                  <span className="font-medium text-chess-text">{aboutInfo?.backendTimestamp || '—'}</span>
                </div>
                {aboutInfo?.backendCommit && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-chess-muted">Backend Commit</span>
                    <span className="font-medium text-chess-text">{aboutInfo.backendCommit}</span>
                  </div>
                )}
                {aboutError && (
                  <div className="text-[11px] text-chess-accentSoft">{aboutError}</div>
                )}
              </div>
            </div>

            {/* Logout */}
            <div className="border-t border-white/12 py-1">
              <button
                onClick={handleLogout}
                data-testid="user-menu-logout"
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-3
                           text-sm text-red-400 hover:bg-red-500/10
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
