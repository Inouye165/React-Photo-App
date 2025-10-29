import { createContext, useContext, useState, useEffect } from 'react';
import { env } from '../env';
import * as api from '../api';
import { setAuthToken } from '../utils/auth';

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
  const [token, setToken] = useState(() => localStorage.getItem('authToken'));

  // Run once on mount — keep deps empty to avoid repeated verification calls
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('authToken');
      const API_BASE = env.VITE_API_URL || '';
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/verify`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${storedToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setToken(storedToken);
        } else {
          localStorage.removeItem('authToken');
          setToken(null);
        }
      } catch (err) {
        console.error('Auth verification failed:', err);
        localStorage.removeItem('authToken');
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const API_BASE = env.VITE_API_URL || '';
      const data = await api.loginUser(username, password, API_BASE || undefined);

      setUser(data.user);
      setToken(data.token);
      // Keep the legacy helper call for compatibility (no-op in this codebase)
      try {
        setAuthToken(data.token);
      } catch (e) { void e; }
      // Persist for parts of the app that still read localStorage
      try { localStorage.setItem('authToken', data.token); } catch (e) { void e; }

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

      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('authToken', data.token);
      return { success: true, user: data.user };
    } catch (err) {
      console.error('Registration error:', err);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        const API_BASE = env.VITE_API_URL || '';
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('authToken');
    }
  };

  const value = { user, token, loading, login, register, logout, isAuthenticated: !!user };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
