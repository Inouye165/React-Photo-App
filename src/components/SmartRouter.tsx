import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPhotoStatus } from '../api';

type SmartRouterStatus = 'loading' | 'redirecting' | 'error';

type AuthUser = {
  id: string;
  email?: string;
} | null;

type AuthProfile = {
  has_set_username?: boolean;
} | null;

type AuthContextValue = {
  user: AuthUser;
  loading: boolean;
  cookieReady: boolean;
  profile: AuthProfile;
  profileLoading: boolean;
};

type PhotoStatusResult = {
  total: number;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Failed to load';
}

function isPhotoStatusResult(value: unknown): value is PhotoStatusResult {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { total?: unknown };
  return typeof maybe.total === 'number' && Number.isFinite(maybe.total);
}

/**
 * SmartRouter - Intelligent initial route handler
 *
 * This component runs on the root path (/) and determines the appropriate
 * landing page based on the user's photo data state:
 *
 * 1. No photos → /upload (clear call to action)
 * 2. Has any photos → /gallery
 * 3. Default fallback → /upload
 *
 * Security:
 * - Only runs for authenticated users (relies on AuthWrapper)
 * - API call validates user session server-side
 * - On auth failure, silently defaults to upload (AuthWrapper handles redirect)
 *
 * UX:
 * - Shows loading spinner while determining route
 * - Prevents "Photo not found" flash on initial load
 * - Enables deep linking via URL query params
 */
export default function SmartRouter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, cookieReady, profile, profileLoading } = useAuth() as AuthContextValue;
  const [status, setStatus] = useState<SmartRouterStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Wait for auth to be ready
    if (authLoading) return;

    // If the user just arrived from a Supabase invite/recovery link, route them to account setup
    // before any other gating/redirect logic (e.g., username gate) runs.
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if (hash.includes('type=invite') || hash.includes('type=recovery') || search.includes('code=')) {
      setStatus('redirecting');
      navigate('/reset-password' + search + hash, { replace: true });
      return;
    }

    // If not authenticated, AuthWrapper will handle it
    if (!user) {
      setStatus('redirecting');
      return;
    }

    // Wait for cookie to be synced before making API calls
    if (!cookieReady) return;

    // Identity Gate (defense in depth):
    // If user hasn't set a username, redirect before doing any other work.
    if (profileLoading) return;
    const onOnboardingPage = location.pathname === '/reset-password';
    if (!onOnboardingPage && profile && profile.has_set_username === false) {
      setStatus('redirecting');
      navigate('/reset-password', { replace: true });
      return;
    }

    let cancelled = false;

    async function determineRoute() {
      try {
        setStatus('loading');

        const result: unknown = await getPhotoStatus();

        if (cancelled) return;
        if (!isPhotoStatusResult(result)) throw new Error('Invalid API response');

        // Determine the best route based on photo counts
        const targetPath = result.total === 0 ? '/upload' : '/gallery';

        setStatus('redirecting');
        navigate(targetPath, { replace: true });
      } catch (err) {
        if (cancelled) return;
        console.error('[SmartRouter] Error determining route:', err);
        setErrorMessage(getErrorMessage(err));
        setStatus('error');

        // On error, redirect to upload as safe fallback after a brief delay
        setTimeout(() => {
          if (!cancelled) {
            navigate('/upload', { replace: true });
          }
        }, 1500);
      }
    }

    determineRoute();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, cookieReady, profile, profileLoading, navigate, location.pathname]);

  // Loading state with spinner
  if (status === 'loading' || status === 'redirecting' || authLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '50vh',
          gap: '16px',
        }}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e2e8f0',
            borderTopColor: '#4f46e5',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <p style={{ color: '#64748b', fontSize: '14px' }}>
          {status === 'redirecting' ? 'Redirecting...' : 'Loading your photos...'}
        </p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Error state (brief, before redirect)
  if (status === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '50vh',
          gap: '16px',
        }}
        role="alert"
      >
        <div style={{ color: '#ef4444', fontSize: '24px' }}>⚠️</div>
        <p style={{ color: '#64748b', fontSize: '14px' }}>{errorMessage || 'Something went wrong'}</p>
        <p style={{ color: '#94a3b8', fontSize: '12px' }}>Redirecting to upload page...</p>
      </div>
    );
  }

  // Should not reach here, but safety fallback
  return null;
}
