import React from 'react';
import { useAuth } from './contexts/AuthContext';
import useStore from './store.js';

const sevStyles = {
  info: { bg: '#3b82f6', text: '#f1f5f9' },
  success: { bg: '#16a34a', text: '#f0fdf4' },
  warning: { bg: '#f59e0b', text: '#1f2937' },
  error: { bg: '#dc2626', text: '#fff' },
};

export default function Toolbar({
  onSelectFolder,
  // new: a small persistent message area in the toolbar
  toolbarMessage,
  toolbarSeverity = 'info',
  onClearToolbarMessage
}) {
  const { user, logout } = useAuth();
  const isAuthenticated = !!user;

  // Connect to store
  const setView = useStore((state) => state.setView);
  const setEditingMode = useStore((state) => state.setEditingMode);
  const setActivePhotoId = useStore((state) => state.setActivePhotoId);
  const setShowMetadataModal = useStore((state) => state.setShowMetadataModal);
  const setMetadataPhoto = useStore((state) => state.setMetadataPhoto);
  const activePhoto = useStore((state) => {
    const activePhotoId = state.activePhotoId;
    if (activePhotoId == null) return null;
    return state.photos.find((photo) => String(photo.id) === String(activePhotoId)) || null;
  });

  const handleAuthAction = () => {
    if (isAuthenticated) {
      logout();
    } else {
      // If not authenticated, the AuthWrapper should handle showing the login form
      // We could also trigger a refresh or redirect here
      window.location.reload();
    }
  };

  const handleViewChange = (viewName) => {
    setView(viewName);
    setEditingMode(null);
    setActivePhotoId(null);
    setShowMetadataModal(false);
    setMetadataPhoto(null);
  };

  const handleShowMetadata = () => {
    if (activePhoto) {
      setMetadataPhoto(activePhoto);
      setShowMetadataModal(true);
    }
  };

  return (
    <nav
      role="navigation"
      aria-label="Main toolbar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60, // higher so it stays above other overlays
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#2d3748", // dark blue-gray
        color: "#fff",
        padding: "14px 28px",
        margin: 0,
        borderBottom: "2px solid #4a5568",
        boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontWeight: "bold", fontSize: "1.1rem", marginRight: "20px" }} tabIndex={-1}>
          Photo App (Backend View)
        </span>
        <button onClick={onSelectFolder}>Select Folder for Upload</button>
        <button onClick={() => handleViewChange('working')}>View Working</button>
        <button onClick={() => handleViewChange('inprogress')}>View Inprogress</button>
        <button onClick={() => handleViewChange('finished')}>View Finished</button>
        <button
          onClick={handleShowMetadata}
          style={{
            background: "#475569",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Show Metadata
        </button>
        
      </div>
      <div style={{ marginLeft: "auto", display: 'flex', alignItems: 'center', gap: '12px' }}>
        {toolbarMessage ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: (sevStyles[toolbarSeverity]?.bg || sevStyles.info.bg), color: (sevStyles[toolbarSeverity]?.text || sevStyles.info.text), padding: '6px 10px', borderRadius: '6px', fontSize: '0.95rem' }} role="status" aria-live="polite">
            <span>{toolbarMessage}</span>
            {typeof onClearToolbarMessage === 'function' && (
              <button onClick={onClearToolbarMessage} title="Dismiss" style={{ background: 'transparent', border: 'none', fontSize: '1rem', cursor: 'pointer', color: '#1f2937' }}>×</button>
            )}
          </div>
        ) : null}
        {isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div 
                style={{
                  width: '28px',
                  height: '28px',
                  background: '#4f46e5',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span style={{ fontSize: '0.9rem', opacity: '0.9' }}>
                {user?.email}
              </span>
            </div>
            <button
              onClick={handleAuthAction}
              style={{
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
              title="Sign out"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={handleAuthAction}
            style={{
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "8px 16px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Login
          </button>
        )}
      </div>
    </nav>
  );
}
