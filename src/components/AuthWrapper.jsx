import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import LandingPage from '../pages/LandingPage';

const AuthWrapper = ({ children }) => {
  const { user, loading } = useAuth();

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

  if (!user) {
    return <LandingPage />;
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