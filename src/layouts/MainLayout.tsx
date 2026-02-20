import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import UploadTray from '../components/uploads/UploadTray';
import useStore from '../store';
import { getDependencyStatus } from '../api';
import { useAuth } from '../contexts/AuthContext';
import type { BannerState } from '../store';

const AI_DEPENDENCY_WARNING = 'AI services unavailable. Start required Docker containers to re-enable processing.';

type Severity = 'info' | 'success' | 'warning' | 'error';

export interface MainLayoutOutletContext {
  aiDependenciesReady: boolean;
  setToolbarMessage: React.Dispatch<React.SetStateAction<string>>;
  toolbarMessage: string;
}

/**
 * MainLayout - Provides the global shell for the application
 * Manages toolbar, banners, and dependency status checks
 */
export default function MainLayout(): React.ReactElement {
  const location = useLocation();
  const { user, authReady } = useAuth();
  const banner = useStore((state) => state.banner);
  const setBanner = useStore((state) => state.setBanner);
  const [toolbarMessage, setToolbarMessage] = useState<string>('');
  const [dependencyWarning, setDependencyWarning] = useState<string>('');
  const [aiDependenciesReady, setAiDependenciesReady] = useState<boolean>(true);

  // Check AI dependency status periodically
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    // Dependency status endpoint is protected; avoid noisy 401/403 before auth.
    if (!authReady || !user) {
      return undefined;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const applyStatus = (queueReady: boolean): void => {
      if (cancelled) return;
      setAiDependenciesReady((prev) => (prev === queueReady ? prev : queueReady));
      setDependencyWarning((prev) => {
        const next = queueReady ? '' : AI_DEPENDENCY_WARNING;
        return prev === next ? prev : next;
      });
    };

    const checkStatus = async (): Promise<void> => {
      try {
        const result = await getDependencyStatus();
        if (cancelled || !result) return;
        const queueReady = !(result.dependencies && result.dependencies.aiQueue === false);
        applyStatus(queueReady);
      } catch {
        applyStatus(false);
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 30000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [authReady, user]);

  // Listen for session expiration events from API layer
  useEffect(() => {
    const handleSessionExpired = (): void => {
      setBanner({ 
        message: 'Session expired. Please refresh or log in again.', 
        severity: 'error' 
      });
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);

    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, [setBanner]);

  // Listen for network failure and recovery events
  useEffect(() => {
    const handleNetworkUnavailable = (): void => {
      setBanner({
        message: "We're having trouble connecting to the server right now. Please try again in a moment.",
        severity: 'error'
      });
    };

    const handleNetworkRecovered = (): void => {
      // Clear the network error banner when connection is restored
      setBanner({
        message: 'Connection restored.',
        severity: 'success'
      });
      
      // Auto-hide the success message after 3 seconds
      setTimeout(() => {
        setBanner({ message: '' });
      }, 3000);
    };

    window.addEventListener('network:unavailable', handleNetworkUnavailable);
    window.addEventListener('network:recovered', handleNetworkRecovered);

    return () => {
      window.removeEventListener('network:unavailable', handleNetworkUnavailable);
      window.removeEventListener('network:recovered', handleNetworkRecovered);
    };
  }, [setBanner]);

  // Build status message for header
  const statusMessage = dependencyWarning || toolbarMessage || banner?.message;
  const bannerSeverity: Severity = (banner as BannerState | null)?.severity ?? 'info';
  const isChatRoute = location.pathname.startsWith('/chat');
  const isChessImmersiveRoute = /^\/games\/(?:chess|[^/]+)$/.test(location.pathname);

  return (
    <div
      className="flex flex-col"
      id="main-app-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: isChessImmersiveRoute ? 0 : '52px',
        backgroundColor: '#cbd5e1', // Slate-300 to match EditPage background
        color: '#1e293b', // Slate-800 for high contrast text
      }}
    >
      {!isChessImmersiveRoute ? (
        <AppHeader 
          rightContent={statusMessage ? (
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: dependencyWarning ? '#fef3c7' : (bannerSeverity === 'error' ? '#fef2f2' : '#f0fdf4'),
                color: dependencyWarning ? '#92400e' : (bannerSeverity === 'error' ? '#b91c1c' : '#16a34a'),
              }}
            >
              <span>{statusMessage}</span>
              {!dependencyWarning && (
                <button 
                  onClick={() => { setToolbarMessage(''); setBanner({ message: '' }); }}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    cursor: 'pointer', 
                    fontSize: '14px',
                    color: 'inherit',
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ) : null}
        />
      ) : null}

      <div aria-live="polite" className="sr-only">
        {toolbarMessage}
      </div>

      {/* Main content area with consistent padding */}
      <div
        className={`flex-1 ${isChatRoute || isChessImmersiveRoute ? 'overflow-hidden' : 'overflow-auto'}`}
        style={isChatRoute || isChessImmersiveRoute ? undefined : { padding: '16px' }}
      >
        <Outlet context={{ 
          aiDependenciesReady, 
          setToolbarMessage,
          toolbarMessage 
        } satisfies MainLayoutOutletContext} />
      </div>

      {!isChessImmersiveRoute ? <UploadTray /> : null}
    </div>
  );
}
