import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import useStore from '../store.js';
import { API_BASE_URL } from '../config/apiConfig.js';
import { setAuthToken } from '../api.js';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

/**
 * Fetch user preferences from the backend
 * Now uses Bearer token auth via getAuthHeaders() in api.js
 */
async function fetchPreferences() {
  try {
    // Import dynamically to avoid circular dependency
    const { getAuthHeaders } = await import('../api.js');
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
      method: 'GET',
      headers: getAuthHeaders()
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
    const { getAuthHeaders } = await import('../api.js');
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
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
    const { getAuthHeaders } = await import('../api.js');
    const response = await fetch(`${API_BASE_URL}/api/users/me/preferences/load-defaults`, {
      method: 'POST',
      headers: getAuthHeaders(),
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
 * @deprecated Cookie sync is deprecated in favor of Bearer token auth.
 * This function is kept for backward compatibility during transition.
 * It will be removed in a future version.
 */
async function _syncSessionCookie(accessToken) {
  if (!accessToken) return false;
  // In Bearer token mode, we just update the token cache instead of syncing cookies
  setAuthToken(accessToken);
  return true;
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
  // authReady tracks if auth state is initialized and token is set in api.js
  // Replaces the deprecated cookieReady state
  const [authReady, setAuthReady] = useState(false);
  // User preferences (grading scales for collectibles)
  const [preferences, setPreferences] = useState({ gradingScales: {} });
  // Track if a login is in progress to prevent onAuthStateChange from racing
  const loginInProgressRef = useRef(false);
  // Track if we're in E2E test mode
  const isE2ERef = useRef(false);

  // Fetch preferences when auth becomes ready
  useEffect(() => {
    if (authReady && user) {
      fetchPreferences().then(setPreferences);
    }
  }, [authReady, user]);

  useEffect(() => {
    const isE2E = import.meta.env.VITE_E2E === 'true' || window.__E2E_MODE__ === true;
    if (isE2E) {
      // Only check E2E session if explicitly enabled
      checkE2ESession()
        .then(async (e2eUser) => {
          if (e2eUser) {
            // E2E test mode - bypass Supabase auth
            isE2ERef.current = true;
            setAuthToken('e2e-test-token');
            setAuthReady(true);
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
          // Set token in api.js for Bearer auth
          setAuthToken(session.access_token);
          setAuthReady(true);
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
        setAuthToken(null);
        setAuthReady(false);
        // Clear photo store to prevent stale data fetches
        useStore.getState().setPhotos([]);
        // Attempt to clear legacy cookie (best effort, will be removed in future)
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
        // Update token in api.js for Bearer auth
        setAuthToken(session.access_token);
        setAuthReady(true);
      } else {
        setAuthToken(null);
        setAuthReady(false);
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

      // Set Bearer token in api.js BEFORE updating state
      // This ensures API calls made after login have the token ready
      if (data.session?.access_token) {
        setAuthToken(data.session.access_token);
        setAuthReady(true);
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

      // Set Bearer token in api.js BEFORE updating state
      if (data.session?.access_token) {
        setAuthToken(data.session.access_token);
        setAuthReady(true);
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
      
      // Update token if session was refreshed
      if (data.session?.access_token) {
        setAuthToken(data.session.access_token);
      }
      return { success: true };
    } catch (err) {
      console.error('Update password error:', err);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      // Clear Bearer token from api.js
      setAuthToken(null);
      
      // Clear legacy httpOnly cookie (best effort, will be removed in future)
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include'
        });
      } catch (cookieError) {
        // Silently fail - cookie may already be cleared or not used
        if (import.meta.env.DEV) {
          console.debug('Legacy cookie clear failed (expected if not using cookies):', cookieError);
        }
      }

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setSession(null);
      setAuthReady(false);
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
    authReady, // Expose so components can check if API calls are safe
    // Deprecated: cookieReady is an alias for authReady for backward compatibility
    cookieReady: authReady,
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
