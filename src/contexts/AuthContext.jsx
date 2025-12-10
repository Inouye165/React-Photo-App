import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import useStore from '../store.js';
import { API_BASE_URL } from '../config/apiConfig.js';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

/**
 * Fetch user preferences from the backend
 */
async function fetchPreferences() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
      method: 'GET',
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      return data.success ? data.data : { gradingScales: {} };
    }
    return { gradingScales: {} };
  } catch (err) {
    console.warn('Failed to fetch preferences:', err);
    return { gradingScales: {} };
  }
}

/**
 * Update user preferences on the backend
 */
async function patchPreferences(newPrefs) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(newPrefs)
    });
    if (response.ok) {
      const data = await response.json();
      return data.success ? data.data : null;
    }
    return null;
  } catch (err) {
    console.warn('Failed to update preferences:', err);
    return null;
  }
}

/**
 * Load default grading scales from the backend
 */
async function loadDefaultPreferences(categories = null) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences/load-defaults`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ categories })
    });
    if (response.ok) {
      const data = await response.json();
      return data.success ? data.data : null;
    }
    return null;
  } catch (err) {
    console.warn('Failed to load default preferences:', err);
    return null;
  }
}

/**
 * Sync the Supabase session token to the backend as an httpOnly cookie.
 * This is required for cookie-based authentication on all API calls.
 */
async function syncSessionCookie(accessToken) {
  if (!accessToken) return false;
  try {
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
  const isE2E = import.meta.env.VITE_E2E === 'true' || window.__E2E_MODE__ === true;
  if (!isE2E) return null; // No-op in normal dev/prod
  try {
    const response = await fetch(`${API_BASE_URL}/api/test/e2e-verify`, {
      method: 'GET',
      credentials: 'include'
    });
    // Only in E2E mode: 200 means success, 401/403 means no session
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.user) {
        return data.user;
      }
    }
    // No E2E session available
    if (import.meta.env.DEV) {
      console.debug('[AuthContext] No E2E session cookie present (expected in E2E mode)');
    }
    return null;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.debug('[AuthContext] E2E session check failed:', err.message);
    }
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // Track if cookie is ready - app should not make API calls until this is true
  const [cookieReady, setCookieReady] = useState(false);
  // User preferences (grading scales for collectibles)
  const [preferences, setPreferences] = useState({ gradingScales: {} });
  // Track if a login is in progress to prevent onAuthStateChange from racing
  const loginInProgressRef = useRef(false);
  // Track if we're in E2E test mode
  const isE2ERef = useRef(false);

  // Fetch preferences when cookie becomes ready
  useEffect(() => {
    if (cookieReady && user) {
      fetchPreferences().then(setPreferences);
    }
  }, [cookieReady, user]);

  useEffect(() => {
    const isE2E = import.meta.env.VITE_E2E === 'true' || window.__E2E_MODE__ === true;
    if (isE2E) {
      // Only check E2E session if explicitly enabled
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
          // No E2E session, treat as not logged in
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
      return;
    }
    // Normal Supabase auth flow
    supabase.auth.getSession()
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
        // Expected during logout or token expiry - debug only
        if (import.meta.env.DEV) {
          console.debug('[AuthContext] Session lost during refresh, cleaning up');
        }
        // Clear local state
        setSession(null);
        setUser(null);
        setCookieReady(false);
        // Clear photo store to prevent stale data fetches
        useStore.getState().setPhotos([]);
        // Clear httpOnly cookie
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

  const updatePassword = async (newPassword) => {
    try {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      // Sync cookie just in case
      if (data.session?.access_token) {
         await syncSessionCookie(data.session.access_token);
      }
      return { success: true };
    } catch (err) {
      console.error('Update password error:', err);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      // Clear httpOnly cookie
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
      setPreferences({ gradingScales: {} });
      // Clear photo store to prevent stale data
      useStore.getState().setPhotos([]);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  /**
   * Update user preferences (optimistic update)
   */
  const updatePreferences = async (newPrefs) => {
    // Optimistic update
    const previousPrefs = preferences;
    setPreferences(prev => ({
      ...prev,
      ...newPrefs,
      gradingScales: {
        ...(prev.gradingScales || {}),
        ...(newPrefs.gradingScales || {})
      }
    }));

    // Persist to backend
    const result = await patchPreferences(newPrefs);
    if (result) {
      setPreferences(result);
      return { success: true, data: result };
    } else {
      // Rollback on failure
      setPreferences(previousPrefs);
      return { success: false, error: 'Failed to update preferences' };
    }
  };

  /**
   * Load default grading scales
   */
  const loadDefaultScales = async (categories = null) => {
    const result = await loadDefaultPreferences(categories);
    if (result) {
      setPreferences(result);
      return { success: true, data: result };
    }
    return { success: false, error: 'Failed to load defaults' };
  };

  const value = {
    user,
    session,
    loading,
    cookieReady, // Expose so components can check if API calls are safe
    preferences,
    updatePreferences,
    loadDefaultScales,
    login,
    register,
    logout,
    signInWithPhone,
    verifyPhoneOtp,
    resetPassword,
    updatePassword,
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
