import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LandingPage from '../pages/LandingPage';
import DisclaimerModal from '../components/DisclaimerModal';
import { API_BASE_URL } from '../config/apiConfig';

interface AuthWrapperProps {
  children: React.ReactNode;
}
const AuthWrapper = ({ children }: AuthWrapperProps) => {
  const { user, loading, authReady, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize state based on current hash to prevent rendering children during invite redirect
  const [isInviteRedirecting, setIsInviteRedirecting] = useState(() => 
    window.location.hash.includes('type=invite')
  );

  // Check for invite link in URL hash and redirect to reset password page
  useEffect(() => {
    if (isInviteRedirecting) {
      // Preserve the hash so ResetPasswordPage can process it
      navigate('/reset-password' + window.location.hash);
    } else if (window.location.hash.includes('type=invite')) {
      // Handle case where hash changes after mount (unlikely but possible)
      setIsInviteRedirecting(true);
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

    const checkTermsAcceptance = async () => {
      try {
        // Import dynamically to avoid circular dependency
        const { getAuthHeaders } = await import('../api');
        const headers = getAuthHeaders() as Record<string, string>;
        // E2E Bypass: Add header if in E2E mode to avoid cookie issues
        if ((window as any).__E2E_MODE__) {
          headers['X-E2E-User-ID'] = '11111111-1111-4111-8111-111111111111';
        }

        const response = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
          method: 'GET',
          headers: headers as HeadersInit,
          credentials: 'include'
        });
        
        if (response.ok) {
          await response.json();
          // Check if the user record has terms_accepted_at
          // Note: This endpoint returns preferences, but we need to check the users table
          // Let's make a dedicated call or check if the backend returns this info
          
          // For now, we'll check via the user metadata if available
          // Or we need to add this to the preferences endpoint response
          
          // Temporary: Check localStorage as fallback (will be replaced by DB check)
          const userId = (user && typeof user === 'object' && user !== null && 'id' in user) ? (user as any).id : '';
          const localAcceptance = localStorage.getItem(`terms_accepted_${userId}`);
          setTermsAccepted(!!localAcceptance);
        }
      } catch (error) {
        console.error('Failed to check terms acceptance:', error);
        // On error, assume terms not accepted to be safe
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
    let ApiErrorCtor: unknown = null;
    try {
      const { getAuthHeaders, request, ApiError } = await import('../api');
      ApiErrorCtor = ApiError;
      const headers = getAuthHeaders() as Record<string, string>;
      // E2E Bypass: Add header if in E2E mode to avoid cookie issues
      if ((window as any).__E2E_MODE__) {
        headers['X-E2E-User-ID'] = '11111111-1111-4111-8111-111111111111';
      }

      // Use the centralized request() wrapper so CSRF headers/cookies are handled consistently.
      await request<void>({
        path: '/api/users/accept-terms',
        method: 'POST',
        headers,
      });

      // Store acceptance locally as well for quick checks
      const userId = (user && typeof user === 'object' && user !== null && 'id' in user) ? (user as any).id : '';
      localStorage.setItem(`terms_accepted_${userId}`, 'true');
      setTermsAccepted(true);
    } catch (error: unknown) {
      console.error('Error accepting terms:', error);
      if (typeof ApiErrorCtor === 'function' && error instanceof (ApiErrorCtor as any)) {
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

  // Authenticated user interface - now just renders the app content
  // User info and logout are handled in the main Toolbar component
  return <div className="min-h-screen bg-gray-100">{children}</div>;
};

export default AuthWrapper;
