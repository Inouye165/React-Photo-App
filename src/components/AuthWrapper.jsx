// import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

const AuthWrapper = ({ children }) => {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(true);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return isLoginMode ? (
      <LoginForm onSwitchToRegister={() => setIsLoginMode(false)} />
    ) : (
      <RegisterForm onSwitchToLogin={() => setIsLoginMode(true)} />
    );
  }

  // Authenticated user interface - now just renders the app content
  // User info and logout are handled in the main Toolbar component
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Main app content */}
      {children}
    </div>
  );
};

export default AuthWrapper;
