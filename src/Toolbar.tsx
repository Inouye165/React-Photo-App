import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { useAuth } from './contexts/AuthContext';
import { listMyGamesWithMembers } from './api/games';
import useStore from './store';
import type { Photo } from './types/photo';

type Severity = 'info' | 'success' | 'warning' | 'error';

interface SeverityStyle {
  bg: string;
  text: string;
}

const sevStyles: Record<Severity, SeverityStyle> = {
  info: { bg: '#3b82f6', text: '#f1f5f9' },
  success: { bg: '#16a34a', text: '#f0fdf4' },
  warning: { bg: '#f59e0b', text: '#1f2937' },
  error: { bg: '#dc2626', text: '#fff' },
};

interface ToolbarProps {
  toolbarMessage?: string;
  toolbarSeverity?: Severity;
  onClearToolbarMessage?: () => void;
}

export default function Toolbar({
  // new: a small persistent message area in the toolbar
  toolbarMessage,
  toolbarSeverity = 'info',
  onClearToolbarMessage
}: ToolbarProps): React.ReactElement {
  const { user, logout } = useAuth();
  const navigate: NavigateFunction = useNavigate();
  const isAuthenticated = !!user;
  const [gamesMenuValue, setGamesMenuValue] = useState('');
  const [games, setGames] = useState<Array<{ id: string; type: string; status: string; members?: Array<{ user_id: string; username: string | null }> }>>([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  // Connect to store
  const setView = useStore((state) => state.setView);
  const setEditingMode = useStore((state) => state.setEditingMode);
  const setActivePhotoId = useStore((state) => state.setActivePhotoId);
  const setShowMetadataModal = useStore((state) => state.setShowMetadataModal);
  const setMetadataPhoto = useStore((state) => state.setMetadataPhoto);
  const activePhoto = useStore((state): Photo | null => {
    const activePhotoId = state.activePhotoId;
    if (activePhotoId == null) return null;
    return state.photos.find((photo) => String(photo.id) === String(activePhotoId)) || null;
  });

  const handleAuthAction = (): void => {
    if (isAuthenticated) {
      logout();
    } else {
      // If not authenticated, the AuthWrapper should handle showing the login form
      // We could also trigger a refresh or redirect here
      window.location.reload();
    }
  };

  // Navigate to gallery with specific view using URL query params
  const handleViewChange = (viewName: 'working' | 'inprogress' | 'finished'): void => {
    setView(viewName);
    setEditingMode(null);
    setActivePhotoId(null);
    setShowMetadataModal(false);
    setMetadataPhoto(null);
    navigate(`/gallery?view=${viewName}`);
  };

  // Navigate to upload page
  const handleUploadClick = (): void => {
    navigate('/upload');
  };

  const handleShowMetadata = (): void => {
    if (activePhoto) {
      setMetadataPhoto(activePhoto);
      setShowMetadataModal(true);
    }
  };

  const typedUser = user as User | null;
  const severityStyle = sevStyles[toolbarSeverity] ?? sevStyles.info;

  useEffect(() => {
    let isActive = true;

    if (!isAuthenticated) {
      setGames([]);
      setGamesLoading(false);
      return () => {
        isActive = false;
      };
    }

    setGamesLoading(true);
    listMyGamesWithMembers()
      .then((data) => {
        if (isActive) {
          setGames(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (isActive) {
          setGames([]);
        }
      })
      .finally(() => {
        if (isActive) {
          setGamesLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isAuthenticated]);

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
        <button onClick={handleUploadClick}>Select Folder for Upload</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="games-menu" style={{ fontSize: '0.9rem' }}>Games</label>
          <select
            id="games-menu"
            value={gamesMenuValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (!nextValue || nextValue.startsWith('__')) return;
              setGamesMenuValue('');
              navigate(nextValue);
            }}
            style={{
              background: '#1f2937',
              color: '#fff',
              border: '1px solid #475569',
              borderRadius: '6px',
              padding: '6px 10px',
            }}
            disabled={!isAuthenticated || gamesLoading}
          >
            <option value="">{gamesLoading ? 'Loading games...' : 'Games'}</option>
            <option value="/games">Chess (Invites)</option>
            {games.filter((game) => game.status === 'active').length ? (
              <option value="__header__" disabled>In progress</option>
            ) : null}
            {games
              .filter((game) => game.status === 'active')
              .map((game) => {
                const opponent = game.members?.find((member) => member.user_id !== user?.id)?.username || 'Opponent'
                const typeLabel = game.type ? `${game.type.charAt(0).toUpperCase()}${game.type.slice(1)}` : 'Game'
                return (
                  <option key={game.id} value={`/games/${game.id}`}>
                    {typeLabel} vs {opponent}
                  </option>
                )
              })}
          </select>
        </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: severityStyle.bg, color: severityStyle.text, padding: '6px 10px', borderRadius: '6px', fontSize: '0.95rem' }} role="status" aria-live="polite">
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
                {typedUser?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span style={{ fontSize: '0.9rem', opacity: '0.9' }}>
                {typedUser?.email}
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
