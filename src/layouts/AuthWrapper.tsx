import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useActivityTracker } from '../hooks/useActivityTracker';
import LandingPage from '../pages/LandingPage';
import DisclaimerModal from '../components/DisclaimerModal';

interface AuthWrapperProps {
  children: React.ReactNode;
}
const AuthWrapper = ({ children }: AuthWrapperProps) => {
  const { user, loading, authReady, logout } = useAuth();
  const navigate = useNavigate();

  // --- Activity tracking & inactivity auto-logout ---
  const handleInactivityLogout = useCallback(async () => {
    await logout();
    navigate('/');
  }, [logout, navigate]);

  useActivityTracker({
    isAuthenticated: Boolean(user && authReady),
    onInactivityLogout: handleInactivityLogout,
  });

  // Initialize state based on current hash to prevent rendering children during invite redirect
  const [isInviteRedirecting, setIsInviteRedirecting] = useState(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    // Supabase can return invite/recovery info via hash (implicit flow) or via ?code= (PKCE/code flow)
    return hash.includes('type=invite') || hash.includes('type=recovery') || search.includes('code=');
  });

  // Check for invite link in URL hash and redirect to reset password page
  useEffect(() => {
    if (isInviteRedirecting) {
      // Preserve the hash so OnboardingPage can process it
      navigate('/reset-password' + (window.location.search || '') + (window.location.hash || ''));
    } else {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('type=invite') || hash.includes('type=recovery') || search.includes('code=')) {
        // Handle case where hash/search changes after mount (unlikely but possible)
        // and ensure we still redirect to the setup page.
      setIsInviteRedirecting(true);
      }
    }
  }, [navigate, isInviteRedirecting]);

  // Handler for Decline & Sign Out
  const handleDecline = async () => {
    await logout();
    // Router-independent redirect (AuthWrapper can render outside Router in some tests)
    window.location.assign('/');
  };
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(true);

  // Check if user has accepted terms when authenticated
  useEffect(() => {
    if (!user || !authReady) {
      setCheckingTerms(false);
      return;
    }

    if ((window as any).__E2E_MODE__) {
      setTermsAccepted(true);
      setCheckingTerms(false);
      return;
    }

    const checkTermsAcceptance = async () => {
      try {
        // Import dynamically to avoid circular dependency
        const api = await import('../api');
        const getAuthHeadersSync = api.getAuthHeaders
        const getAuthHeadersAsync = api.getAuthHeadersAsync
        const headersSync = getAuthHeadersSync ? (getAuthHeadersSync() as Record<string, string>) : {}
        // E2E Bypass: Add header if in E2E mode to avoid cookie issues
        if ((window as any).__E2E_MODE__) {
          headersSync['X-E2E-User-ID'] = '11111111-1111-4111-8111-111111111111';
        }

        // Prefer async header getter to ensure fresh token if available
        let headers = headersSync
        if (typeof getAuthHeadersAsync === 'function') {
          try {
            const asyncHeaders = (await getAuthHeadersAsync()) || {}
            headers = { ...headers, ...asyncHeaders }
          } catch (err) {
          }
        }

        await api.request({
          path: '/api/users/me/preferences',
          method: 'GET',
          headers,
        });
        
        // TODO: replace with a dedicated terms-acceptance field from the backend.
        
        // Temporary fallback: rely on localStorage until terms acceptance is exposed by API.
        const userId = String((user as any)?.id ?? '');
        const localAcceptance = localStorage.getItem(`terms_accepted_${userId}`);
        setTermsAccepted(!!localAcceptance);
      } catch (error) {
        console.error('Failed to check terms acceptance:', error);
        // Fail closed on read errors and require explicit acceptance.
        setTermsAccepted(false);
      } finally {
        setCheckingTerms(false);
      }
    };

    checkTermsAcceptance();
  }, [user, authReady]);

  const handleAcceptTerms = async () => {
    if (!user) return;

    setIsAccepting(true);
    try {
        const api = await import('../api')
        const getAuthHeadersSync = api.getAuthHeaders
        const getAuthHeadersAsync = api.getAuthHeadersAsync
        const headersSync = getAuthHeadersSync ? (getAuthHeadersSync() as Record<string, string>) : {}
        if ((window as any).__E2E_MODE__) {
          headersSync['X-E2E-User-ID'] = '11111111-1111-4111-8111-111111111111';
        }

        let headers = headersSync
        if (typeof getAuthHeadersAsync === 'function') {
          try {
            const asyncHeaders = await getAuthHeadersAsync()
            headers = { ...headers, ...asyncHeaders }
          } catch (err) {
          }
        }

        // Use the centralized request() wrapper so CSRF headers/cookies are handled consistently.
        await api.request<void>({
          path: '/api/users/accept-terms',
          method: 'POST',
          headers,
        });

      // Store acceptance locally as well for quick checks
      const userId = String((user as any)?.id ?? '');
      localStorage.setItem(`terms_accepted_${userId}`, 'true');
      setTermsAccepted(true);
    } catch (error: unknown) {
      console.error('Error accepting terms:', error);
      // Dynamic import means ApiError is not in scope here, so use duck typing
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        alert(`Failed to save acceptance: ${apiError.status ?? ''} ${apiError.message}`.trim());
      } else {
        alert('Network error. Please check your connection and try again.');
      }
    } finally {
      setIsAccepting(false);
    }
  };

  if (isInviteRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Redirecting to account setup...</p>
        </div>
      </div>
    );
  }

  if (loading || checkingTerms) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  // Show disclaimer modal if terms not accepted
  if (termsAccepted === false) {
    return <DisclaimerModal onAccept={handleAcceptTerms} onDeny={handleDecline} isAccepting={isAccepting} />;
  }

  // Authenticated shell renders children; account controls live in dedicated UI.
  return <div className="min-h-screen bg-gray-100">{children}</div>;
};

export default AuthWrapper;
