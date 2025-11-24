import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session - MUST complete before rendering children
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch((error) => {
        console.error('Auth session initialization error:', error);
        // Fail-safe: default to unauthenticated state
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        // Only set loading to false after initial session check completes
        setLoading(false);
      });

    // Listen for changes (subsequent auth events)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Do NOT set loading(false) here - only the initial getSession controls loading
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Set httpOnly cookie for secure image authentication
      // This eliminates the need for token query parameters
      if (data.session?.access_token) {
        try {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
          await fetch(`${API_BASE_URL}/api/auth/session`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${data.session.access_token}`,
              'Content-Type': 'application/json'
            },
            credentials: 'include' // Important: allows cookies to be set
          });
        } catch (cookieError) {
          console.warn('Failed to set auth cookie:', cookieError);
          // Non-fatal: user can still use Bearer token auth
        }
      }

      return { success: true, user: data.user };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: err.message };
    }
  };

  const register = async (username, email, password) => {
    try {
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

      // Set httpOnly cookie for secure image authentication
      if (data.session?.access_token) {
        try {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
          await fetch(`${API_BASE_URL}/api/auth/session`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${data.session.access_token}`,
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });
        } catch (cookieError) {
          console.warn('Failed to set auth cookie:', cookieError);
        }
      }

      return { success: true, user: data.user };
    } catch (err) {
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
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const value = {
    user,
    session,
    loading,
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
