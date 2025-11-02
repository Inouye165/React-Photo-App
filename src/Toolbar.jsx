import React from 'react';
import { useAuth } from './contexts/AuthContext';

export default function Toolbar({
  onViewStaged,
  onViewInprogress,
  onViewFinished,
  onSelectFolder,
  onShowMetadata,
  // new: a small persistent message area in the toolbar
  toolbarMessage,
  onClearToolbarMessage
}) {
  const { isAuthenticated, user, logout } = useAuth();

  const handleAuthAction = () => {
    if (isAuthenticated) {
      logout();
    } else {
      // If not authenticated, the AuthWrapper should handle showing the login form
      // We could also trigger a refresh or redirect here
      window.location.reload();
    }
  };

  return (
    <nav
      role="navigation"
      aria-label="Main toolbar"
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        right: 16,
        zIndex: 50, // keep above modals/overlays (modals use z-40)
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#2d3748", // dark blue-gray
        color: "#fff",
        padding: "12px 24px",
        margin: 0,
        borderRadius: "8px",
        border: "2px solid #4a5568",
        boxShadow: "0 2px 10px rgba(0,0,0,0.16)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontWeight: "bold", fontSize: "1.1rem", marginRight: "20px" }} tabIndex={-1}>
          Photo App (Backend View)
        </span>
        <button onClick={onSelectFolder}>Select Folder for Upload</button>
  <button onClick={onViewStaged}>View Working</button>
        <button onClick={onViewInprogress}>View Inprogress</button>
        <button onClick={onViewFinished}>View Finished</button>
        <button
          onClick={onShowMetadata}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f6ad55', color: '#1f2937', padding: '6px 10px', borderRadius: '6px', fontSize: '0.95rem' }} role="status" aria-live="polite">
            <span>{toolbarMessage}</span>
            <button onClick={onClearToolbarMessage} title="Dismiss" style={{ background: 'transparent', border: 'none', fontSize: '1rem', cursor: 'pointer', color: '#1f2937' }}>×</button>
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
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span style={{ fontSize: '0.9rem', opacity: '0.9' }}>
                {user?.username}
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
