import { createContext, useContext, useState, useEffect } from 'react';
import { env } from '../env';
import * as api from '../api';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // No client-side token state — httpOnly cookie is single source of truth

  // Run once on mount — keep deps empty to avoid repeated verification calls
  useEffect(() => {
    const checkAuth = async () => {
      const API_BASE = env.VITE_API_URL || '';

      try {
        // Rely only on the httpOnly cookie sent automatically by the browser
        const response = await fetch(`${API_BASE}/auth/verify`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // Any failure (401 etc.) means no authenticated user
          setUser(null);
        }
      } catch (err) {
        console.error('Auth verification failed:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const API_BASE = env.VITE_API_URL || '';
      // api.loginUser should set the httpOnly cookie on the server side. We
      // rely on that and only set the user state here.
      const data = await api.loginUser(username, password, API_BASE || undefined);

      setUser(data.user);

      return { success: true, user: data.user };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: err.message };
    }
  };

  const register = async (username, email, password) => {
    try {
      const API_BASE = env.VITE_API_URL || '';
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');

      // Server sets httpOnly cookie; client only updates user state
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      console.error('Registration error:', err);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      const API_BASE = env.VITE_API_URL || '';
      // Tell server to clear httpOnly cookie; include credentials so cookie is sent
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      // Do not manage tokens client-side
    }
  };

  const value = { user, loading, login, register, logout, isAuthenticated: !!user };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
