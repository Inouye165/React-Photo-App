import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import useStore from '../store';
import { ChevronLeft, ChevronRight, Upload, Grid3X3, Edit3, LogOut } from 'lucide-react';

/**
 * AppHeader - Mobile-first responsive navigation header
 * 
 * Features:
 * - Mobile (< 640px): Icons only, compact layout, visible logout
 * - Desktop: Full labels with icons
 * - Fat Finger Rule: All touch targets ≥ 44x44px
 * - PWA-ready fixed header with safe-area-inset support
 */
export default function AppHeader({ 
  rightContent,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, profile } = useAuth();
  const lastEditedPhotoId = useStore(state => state.lastEditedPhotoId);
  const closePicker = useStore(state => state.pickerCommand.closePicker);

  const isGalleryPage = location.pathname === '/gallery' || location.pathname === '/';
  const isEditPage = /^\/photos\/[^/]+\/edit$/.test(location.pathname);
  const isUploadPage = location.pathname === '/upload';

  const currentPhotoId = (() => {
    const match = location.pathname.match(/^\/photos\/([^/]+)(?:\/edit)?$/);
    return match ? match[1] : null;
  })();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    }
  };

  const handleForward = () => {
    window.history.forward();
  };

  const handleLogout = () => {
    logout();
  };

  const handleEditClick = () => {
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
  const NavTab = ({ isActive, onClick, icon: Icon, label, testId }) => (
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
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
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
          📷 <span className="hidden sm:inline">Lumina</span>
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
      <nav className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-1 
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
      </nav>

      {/* Right Section - User & Logout */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink-0">
        {rightContent}
        
        {user && (
          <div className="flex items-center gap-1 sm:gap-2">
            {/* User avatar - always visible */}
            <div 
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500"
              title={profile?.username || 'User'}
            >
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center
                            text-xs font-semibold text-slate-600">
                {(profile?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <span className="hidden md:block max-w-[80px] truncate">
                {profile?.username || 'User'}
              </span>
            </div>
            
            {/* Logout button - always visible, 44px touch target */}
            <button
              onClick={handleLogout}
              data-testid="logout-button"
              aria-label="Sign out"
              className="flex items-center justify-center gap-1.5
                        min-w-[44px] min-h-[44px] px-2 sm:px-3
                        rounded-lg border border-slate-200 bg-white
                        text-slate-500 text-xs sm:text-sm font-medium
                        hover:bg-slate-50 hover:border-slate-300
                        active:bg-slate-100 transition-all touch-manipulation"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
