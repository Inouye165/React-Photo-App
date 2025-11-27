import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import useStore from '../store.js';
import { ChevronLeft, ChevronRight, Upload, Grid3X3, Clock, Edit3, CheckCircle, LogOut } from 'lucide-react';

/**
 * AppHeader - Consistent navigation header across ALL views
 * 
 * Features:
 * - Photo App branding always visible
 * - Back/Forward browser navigation arrows
 * - Navigation tabs always visible (Upload, Queued, In Progress, Edit, Finished)
 * - Traditional logout button
 * - Fixed-width tabs to prevent layout shifts
 */
export default function AppHeader({ 
  rightContent,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const lastEditedPhotoId = useStore(state => state.lastEditedPhotoId);
  const setShowUploadPicker = useStore(state => state.setShowUploadPicker);
  
  // Determine active view from URL
  const searchParams = new URLSearchParams(location.search);
  const currentView = searchParams.get('view') || 'working';
  const isGalleryPage = location.pathname === '/gallery' || location.pathname === '/';
  const isEditPage = location.pathname.includes('/edit');
  const isUploadPage = location.pathname === '/upload';

  const handleViewChange = (viewName) => {
    // Close any open upload picker modal when navigating to gallery views
    setShowUploadPicker(false);
    navigate(`/gallery?view=${viewName}`);
  };

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
    // Close any open upload picker modal when navigating to edit
    setShowUploadPicker(false);
    // If we have a last edited photo, go there; otherwise go to inprogress
    if (lastEditedPhotoId) {
      navigate(`/photos/${lastEditedPhotoId}/edit`);
    } else {
      navigate('/gallery?view=inprogress');
    }
  };

  // Navigation tab styling with fixed min-width for stability
  const getTabStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    padding: '6px 12px',
    minWidth: '90px', // Fixed width prevents layout shift
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: 'none',
    backgroundColor: isActive ? '#0f172a' : 'transparent',
    color: isActive ? '#ffffff' : '#64748b',
  });

  // Arrow button style
  const arrowButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };

  return (
    <header
      role="navigation"
      aria-label="Main toolbar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      {/* Left Section - Logo & Navigation Arrows */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '200px' }}>
        {/* App Logo */}
        <span style={{ 
          fontWeight: 700, 
          fontSize: '14px', 
          color: '#0f172a',
          letterSpacing: '-0.02em',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          whiteSpace: 'nowrap',
        }}>
          📷 Photo App
        </span>
        
        {/* Back/Forward Arrows */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '8px' }}>
          <button
            onClick={handleBack}
            title="Go back"
            style={arrowButtonStyle}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={handleForward}
            title="Go forward"
            style={arrowButtonStyle}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Center Section - Navigation Tabs (ALWAYS visible, fixed width) */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        gap: '2px',
        backgroundColor: '#f8fafc',
        padding: '4px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
      }}>
        <button
          onClick={() => {
            // Close any open upload picker modal when navigating to upload page
            setShowUploadPicker(false);
            navigate('/upload');
          }}
          style={getTabStyle(isUploadPage)}
        >
          <Upload size={14} />
          <span>Upload</span>
        </button>
        <button
          onClick={() => handleViewChange('working')}
          style={getTabStyle(isGalleryPage && currentView === 'working')}
        >
          <Grid3X3 size={14} />
          <span>Queued</span>
        </button>
        <button
          onClick={() => handleViewChange('inprogress')}
          style={getTabStyle(isGalleryPage && currentView === 'inprogress')}
        >
          <Clock size={14} />
          <span>In Progress</span>
        </button>
        <button
          onClick={handleEditClick}
          style={getTabStyle(isEditPage)}
        >
          <Edit3 size={14} />
          <span>Edit</span>
        </button>
        <button
          onClick={() => handleViewChange('finished')}
          style={getTabStyle(isGalleryPage && currentView === 'finished')}
        >
          <CheckCircle size={14} />
          <span>Finished</span>
        </button>
      </div>

      {/* Right Section - Actions & User */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'flex-end',
        gap: '12px',
        width: '200px',
      }}>
        {rightContent}
        
        {/* User Section */}
        {user && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
          }}>
            {/* User avatar/email */}
            <div 
              style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#64748b',
              }}
              title={user.email}
            >
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 600,
                color: '#475569',
              }}>
                {user.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span style={{ 
                maxWidth: '80px', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}>
                {user.email?.split('@')[0]}
              </span>
            </div>
            
            {/* Traditional Logout button with text */}
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#64748b',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
