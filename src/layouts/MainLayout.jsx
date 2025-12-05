import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import AppHeader from '../components/AppHeader.jsx';
import useStore from '../store.js';
import { getDependencyStatus } from '../api.js';

const AI_DEPENDENCY_WARNING = 'AI services unavailable. Start required Docker containers to re-enable processing.';

/**
 * MainLayout - Provides the global shell for the application
 * Manages toolbar, banners, and dependency status checks
 */
export default function MainLayout() {
  const banner = useStore((state) => state.banner);
  const setBanner = useStore((state) => state.setBanner);
  const [toolbarMessage, setToolbarMessage] = useState('');
  const [dependencyWarning, setDependencyWarning] = useState('');
  const [aiDependenciesReady, setAiDependenciesReady] = useState(true);

  // Check AI dependency status periodically
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;
    let intervalId = null;

    const applyStatus = (queueReady) => {
      if (cancelled) return;
      setAiDependenciesReady((prev) => (prev === queueReady ? prev : queueReady));
      setDependencyWarning((prev) => {
        const next = queueReady ? '' : AI_DEPENDENCY_WARNING;
        return prev === next ? prev : next;
      });
    };

    const checkStatus = async () => {
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
    intervalId = window.setInterval(checkStatus, 30000);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  // Listen for session expiration events from API layer
  useEffect(() => {
    const handleSessionExpired = () => {
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
    const handleNetworkUnavailable = () => {
      setBanner({
        message: "We're having trouble connecting to the server right now. Please try again in a moment.",
        severity: 'error'
      });
    };

    const handleNetworkRecovered = () => {
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
        paddingTop: '52px', // Match AppHeader height
        backgroundColor: '#cbd5e1', // Slate-300 to match EditPage background
        color: '#1e293b', // Slate-800 for high contrast text
      }}
    >
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
              backgroundColor: dependencyWarning ? '#fef3c7' : (banner?.severity === 'error' ? '#fef2f2' : '#f0fdf4'),
              color: dependencyWarning ? '#92400e' : (banner?.severity === 'error' ? '#dc2626' : '#16a34a'),
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

      <div aria-live="polite" className="sr-only">
        {toolbarMessage}
      </div>

      {/* Main content area with consistent padding */}
      <div 
        className="flex-1 overflow-auto" 
        style={{ 
          padding: '16px',
        }}
      >
        <Outlet context={{ 
          aiDependenciesReady, 
          setToolbarMessage,
          toolbarMessage 
        }} />
      </div>
    </div>
  );
}
