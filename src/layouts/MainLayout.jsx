import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Toolbar from '../Toolbar.jsx';
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

  return (
    <div
      className="flex flex-col bg-gray-100"
      id="main-app-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: '96px',
      }}
    >
      <Toolbar
        onSelectFolder={() => {
          // This will be handled by the router/context in next steps
          useStore.getState().setShowUploadPicker(true);
        }}
        toolbarMessage={dependencyWarning || toolbarMessage || banner?.message}
        toolbarSeverity={dependencyWarning ? 'warning' : (banner?.severity || 'info')}
        onClearToolbarMessage={
          dependencyWarning 
            ? undefined 
            : () => { 
                setToolbarMessage(''); 
                setBanner({ message: '' }); 
              }
        }
      />

      <div aria-live="polite" className="sr-only">
        {toolbarMessage}
      </div>

      <div className="flex-1 overflow-auto" style={{ padding: '8px 16px 16px 16px' }}>
        <Outlet context={{ 
          aiDependenciesReady, 
          setToolbarMessage,
          toolbarMessage 
        }} />
      </div>
    </div>
  );
}
