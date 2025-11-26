import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

/**
 * Sync the Supabase session token to the backend as an httpOnly cookie.
 * This is required for cookie-based authentication on all API calls.
 */
async function syncSessionCookie(accessToken) {
  if (!accessToken) return false;
  try {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    return response.ok;
  } catch (err) {
    console.warn('Failed to sync session cookie:', err);
    return false;
  }
}

/**
 * Check if the backend has an E2E test session cookie set.
 * Used for Playwright/Cypress E2E tests to bypass Supabase auth.
 * 
 * Note: This will return 401 in normal usage (not in E2E mode), which is expected.
 * The 401 is silently caught here to avoid console noise.
 */
async function checkE2ESession() {
  try {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    const response = await fetch(`${API_BASE_URL}/api/test/e2e-verify`, {
      method: 'GET',
      credentials: 'include'
    });
    
    // Expected: 401 when not in E2E mode, 200 when in E2E mode
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.user) {
        return data.user;
      }
    }
    // Silently return null for 401/403 (expected in normal usage)
    return null;
  } catch (err) {
    // Network or other unexpected errors - log but don't crash
    console.debug('[AuthContext] E2E session check failed (expected in normal usage):', err.message);
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // Track if cookie is ready - app should not make API calls until this is true
  const [cookieReady, setCookieReady] = useState(false);
  // Track if a login is in progress to prevent onAuthStateChange from racing
  const loginInProgressRef = useRef(false);
  // Track if we're in E2E test mode
  const isE2ERef = useRef(false);

  useEffect(() => {
    // Check for E2E test session first (for Playwright tests)
    checkE2ESession()
      .then(async (e2eUser) => {
        if (e2eUser) {
          // E2E test mode - bypass Supabase auth
          isE2ERef.current = true;
          setCookieReady(true);
          setUser(e2eUser);
          setSession({ user: e2eUser, access_token: 'e2e-test-token' });
          setLoading(false);
          return;
        }
        
        // Normal Supabase auth flow
        return supabase.auth.getSession()
          .then(async ({ data: { session } }) => {
            if (session?.access_token) {
              // Sync cookie BEFORE setting state to prevent race conditions
              await syncSessionCookie(session.access_token);
              setCookieReady(true);
            }
            setSession(session);
            setUser(session?.user ?? null);
          })
          .catch((error) => {
            console.error('Auth session initialization error:', error);
            setSession(null);
            setUser(null);
          })
          .finally(() => {
            setLoading(false);
          });
      })
      .catch(() => {
        setLoading(false);
      });

    // Listen for changes (subsequent auth events like token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Skip if we're in E2E test mode
      if (isE2ERef.current) {
        return;
      }
      // Skip if login is being handled by the login function
      if (loginInProgressRef.current) {
        return;
      }
      
      // Handle token refresh errors (e.g., invalid refresh token)
      // When Supabase can't refresh the token, event is 'TOKEN_REFRESHED' but session is null
      // or we get an explicit SIGNED_OUT event
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') && !session) {
        console.warn('[AuthContext] Session lost during refresh, cleaning up');
        
        // Clear local state
        setSession(null);
        setUser(null);
        setCookieReady(false);
        
        // Clear httpOnly cookie
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
        try {
          await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
          });
        } catch {
          // Silently fail - cookie may already be cleared
        }
        
        return;
      }
      
      if (session?.access_token) {
        // Sync cookie before updating state
        await syncSessionCookie(session.access_token);
        setCookieReady(true);
      } else {
        setCookieReady(false);
      }
      
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    try {
      // Prevent onAuthStateChange from racing with us
      loginInProgressRef.current = true;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Set httpOnly cookie BEFORE updating state
      // This ensures API calls made after login have the cookie ready
      if (data.session?.access_token) {
        const cookieSet = await syncSessionCookie(data.session.access_token);
        if (!cookieSet) {
          console.warn('Cookie sync failed during login, API calls may fail');
        }
        setCookieReady(cookieSet);
      }
      
      // NOW update state - this triggers re-renders and API calls
      setSession(data.session);
      setUser(data.user);
      
      // Allow onAuthStateChange to work again
      loginInProgressRef.current = false;

      return { success: true, user: data.user };
    } catch (err) {
      loginInProgressRef.current = false;
      console.error('Login error:', err);
      return { success: false, error: err.message };
    }
  };

  const register = async (username, email, password) => {
    try {
      loginInProgressRef.current = true;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });

      if (error) throw error;

      // Set httpOnly cookie BEFORE updating state
      if (data.session?.access_token) {
        const cookieSet = await syncSessionCookie(data.session.access_token);
        setCookieReady(cookieSet);
      }
      
      setSession(data.session);
      setUser(data.user);
      loginInProgressRef.current = false;

      return { success: true, user: data.user };
    } catch (err) {
      loginInProgressRef.current = false;
      console.error('Registration error:', err);
      return { success: false, error: err.message };
    }
  };

  const signInWithPhone = async (phone) => {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        phone,
      });

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      console.error('Phone sign-in error:', err);
      return { success: false, error: err.message };
    }
  };

  const verifyPhoneOtp = async (phone, token) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (error) throw error;
      return { success: true, user: data.user };
    } catch (err) {
      console.error('OTP verification error:', err);
      return { success: false, error: err.message };
    }
  };

  const resetPassword = async (email) => {
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      console.error('Password reset error:', err);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      // Clear httpOnly cookie
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include'
        });
      } catch (cookieError) {
        console.warn('Failed to clear auth cookie:', cookieError);
      }

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setSession(null);
      setCookieReady(false);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const value = {
    user,
    session,
    loading,
    cookieReady, // Expose so components can check if API calls are safe
    login,
    register,
    logout,
    signInWithPhone,
    verifyPhoneOtp,
    resetPassword,
  };

  // CRITICAL: Block rendering until auth state is initialized
  // This prevents "flash of unauthenticated content" and race conditions
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
