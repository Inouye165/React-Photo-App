import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
  const isHomeRoute = location.pathname === '/';
  const isChessImmersiveRoute = /^\/games\/(?:chess|[^/]+)$/.test(location.pathname);
  const contentOverflowClass = isHomeRoute
    ? 'overflow-hidden'
    : isChatRoute
    ? 'overflow-hidden'
    : isChessImmersiveRoute
      ? 'overflow-auto lg:overflow-hidden'
      : 'overflow-auto';

  return (
    <div
      className="flex flex-col font-body"
      id="main-app-container"
      data-theme={isChatRoute ? 'chat' : 'chess'}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'calc(env(safe-area-inset-left) + 4px)',
        paddingRight: 'calc(env(safe-area-inset-right) + 4px)',
        ...(isChatRoute
          ? {}
          : { backgroundColor: '#17110e', color: '#f3ece4' }),
      }}
    >
      <div aria-live="polite" className="sr-only">
        {toolbarMessage}
      </div>

      {!isChessImmersiveRoute && statusMessage ? (
        <div
          className="mx-3 mt-2 rounded-xl border px-3 py-2 text-sm"
          style={{
            backgroundColor: dependencyWarning ? '#fef3c7' : (bannerSeverity === 'error' ? '#fef2f2' : '#f0fdf4'),
            borderColor: dependencyWarning ? '#fcd34d' : (bannerSeverity === 'error' ? '#fecaca' : '#86efac'),
            color: dependencyWarning ? '#92400e' : (bannerSeverity === 'error' ? '#b91c1c' : '#166534'),
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span>{statusMessage}</span>
            {!dependencyWarning ? (
              <button
                onClick={() => { setToolbarMessage(''); setBanner({ message: '' }); }}
                className="rounded px-2 py-0.5 text-xs font-semibold"
                style={{ color: 'inherit' }}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Main content area with consistent padding */}
      <div
        className={`flex-1 ${contentOverflowClass}`}
        style={isChatRoute || isChessImmersiveRoute || isHomeRoute ? undefined : { padding: '12px' }}
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
